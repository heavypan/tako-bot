const { Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const express = require('express');
require('dotenv').config();


// ==================== BASE DE DATOS (Mongoose) ====================
const mongoose = require('mongoose');

// ** Conexión a MongoDB Atlas **
mongoose.connect(process.env.MONGO_URI)
  .then(() => log('Conectado a MongoDB Atlas.'))
  .catch(err => log(`Error de conexión a MongoDB: ${err.message}`));


// ** Esquema y Modelo de Configuración **
// Usaremos un único documento que guardará todas las configuraciones (welcome, bye, etc.)
const configSchema = new mongoose.Schema({
    _id: { type: String, default: 'botConfig' }, // Usamos un ID fijo para tener solo un documento
    bienvenida: Object,
    despedida: Object,
    // Puedes añadir más configuraciones aquí
}, { strict: false }); // 'strict: false' permite campos flexibles si los necesitas

const ConfigModel = mongoose.model('Config', configSchema);

// Función para cargar la configuración al iniciar el bot
async function loadConfig() {
    let savedConfig = await ConfigModel.findById('botConfig');
    if (!savedConfig) {
        log('No se encontró configuración previa. Creando nuevo documento.');
        savedConfig = new ConfigModel({ _id: 'botConfig', bienvenida: null, despedida: null });
        await savedConfig.save();
    }
    log('Configuración cargada desde MongoDB.');
    // Devolvemos el objeto plano de la configuración
    return savedConfig.toObject(); 
}

// Función para guardar una nueva configuración (bienvenida o despedida)
async function saveConfig(key, value) {
    // Usamos $set para actualizar solo el campo específico
    await ConfigModel.findByIdAndUpdate('botConfig', { $set: { [key]: value } }, { new: true, upsert: true });
    log(`Configuración de ${key} guardada en MongoDB.`);
}

// =======================================================================


const TOKEN = process.env.DISCORD_TOKEN;
const prefix = '!';

function log(msg) {
    const time = new Date().toISOString().replace('T', ' ').split('.')[0];
    console.log(`[${time}] ${msg}`);
}

let config = {};
try {
    if (process.env.BOT_CONFIG) {
        config = JSON.parse(process.env.BOT_CONFIG);
        log('Configuración cargada.');
    } else {
        config = {};
        log('Iniciando configuración vacía.');
    }
} catch (err) {
    log(`Error al leer configuración: ${err.message}`);
    config = {};
}

// ==================== FUNCIONES ====================
function checkPermissions(member) {
    return member.permissions.has([
        PermissionFlagsBits.Administrator,
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageMessages
    ]);
}

// Función para enviar embed dinámico reemplazando placeholders
function enviarEmbed(member, tipo, testChannel = null) {
    const settings = config[tipo];
    if (!settings || !settings.embedJson) return;

    const targetChannel = testChannel || member.guild.channels.cache.get(settings.canalId);
    if (!targetChannel) return;
    
    let embed = JSON.parse(JSON.stringify(settings.embedJson));

    if (member) {
        if (embed.embeds && Array.isArray(embed.embeds) && embed.embeds[0] && embed.embeds[0].description) {
            embed.embeds[0].description = embed.embeds[0].description
                .replace(/{usuario}/g, `<@${member.id}>`)
                .replace(/{nombreUsuario}/g, member.user.username)
                .replace(/{miembrosTotales}/g, member.guild.memberCount.toString());
        }
    }

    targetChannel.send({ embeds: [EmbedBuilder.from(embed.embeds[0])] });
}

// ==================== CLIENTE ====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once(Events.ClientReady, () => {
    log(`Bot iniciado como ${client.user.tag}`);
});

// Evento cuando un miembro entra
client.on(Events.GuildMemberAdd, (member) => {
    enviarEmbed(member, 'bienvenida');
});

// Evento cuando un miembro sale
client.on(Events.GuildMemberRemove, (member) => {
    enviarEmbed(member, 'despedida');
});

// ==================== COMANDOS ====================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    const adminCommands = ['setwelcome', 'setbye', 'testwelcome', 'testbye', 'showconfig', 'send'];
    if (adminCommands.includes(command) && !checkPermissions(message.member))
        return;

    try {
        switch (command) {

            case 'setwelcome':
            case 'setbye': {
                const key = command === 'setwelcome' ? 'bienvenida' : 'despedida';
                let channelId = args[0];
                if (channelId?.startsWith('<#') && channelId.endsWith('>')) channelId = channelId.slice(2, -1);

                const jsonText = message.content.slice(command.length + 2 + (args[0]?.length || 0)).trim();
                if (!channelId || !jsonText)
                    return message.reply(`Uso: \`!${command} #canal <JSON de Embed>\``);

                const targetChannel = message.guild.channels.cache.get(channelId);
                if (!targetChannel) return message.reply('Canal inválido.');

                try {
                    const jsonString = jsonText.replace(/```json|```/g, '').trim();
                    const parsed = JSON.parse(jsonString);
                    if (!parsed.embeds || !Array.isArray(parsed.embeds))
                        return message.reply('El JSON debe contener un array llamado "embeds".');

                    config[key] = { canalId: channelId, embedJson: parsed };
                    message.reply(`${key} configurada correctamente.`);
                } catch (error) {
                    message.reply(`Error en el JSON: ${error.message}`);
                }
                break;
            }

        // ==================== COMANDO SEND (no tocado salvo lo necesario) ====================
        case 'send': {
            let channelId = args[0];

            if (channelId?.startsWith('<') && channelId.endsWith('>')) {
                channelId = channelId.replace(/[<#>]/g, '');
            }

            if (!channelId)
                return message.reply(`Uso: !send canal mensaje_o_JSON`);

            const targetChannel = message.guild.channels.cache.get(channelId);
            if (!targetChannel)
                return message.reply('Canal inválido.');

            const messageText = message.content.split(/\s+/).slice(2).join(" ").trim();

            if (!messageText && message.attachments.size === 0)
                return message.reply(`Uso: !send canal mensaje_o_JSON`);

            try {
                let parsed = null;

                try {
                    const cleaned = messageText.replace(/```json|```/g, '').trim();
                    parsed = JSON.parse(cleaned);
                } catch {
                    parsed = null;
                }

                let sendOptions = {};

                if (message.attachments.size > 0) {
                    sendOptions.files = [...message.attachments.values()].map(a => a.url);
                }

                if (parsed) {
                    if (parsed.content) sendOptions.content = parsed.content;

                    if (parsed.embeds && Array.isArray(parsed.embeds)) {
                        sendOptions.embeds = parsed.embeds.map(e => EmbedBuilder.from(e));
                    }

                    if (!parsed.content && !parsed.embeds)
                        return message.reply('El JSON debe incluir "content" o "embeds".');

                } else {
                    sendOptions.content = messageText;
                }

                await targetChannel.send(sendOptions);
                message.react('✅');

            } catch (error) {
                message.reply(`Error al enviar: ${error.message}`);
            }

            break;
        }
        // ================================================================================

            case 'testwelcome':
            case 'testbye': {
                const tipo = command === 'testwelcome' ? 'bienvenida' : 'despedida';
                enviarEmbed(message.member, tipo, message.channel);
                break;
            }

            case 'showconfig':
                message.channel.send(`\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``);
                break;

            case 'help': {
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('🐙 Comandos de Tako')
                    .setDescription(`Mi prefijo es: \`${prefix}\``)
                    .addFields(
                        { 
                            name: 'Comandos de Admin', 
                            value: `
                            \`${prefix}setwelcome #canal <JSON>\`
                            \`${prefix}setbye #canal <JSON>\`
                            \`${prefix}testwelcome\`
                            \`${prefix}testbye\`
                            \`${prefix}send #canal <mensaje/JSON>\`
                            \`${prefix}showconfig\`
                            `
                        },
                        {
                            name: 'Comandos',
                            value: `
                            \`${prefix}help\`
                            `
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Hecho por Danilow' });
                    
                message.channel.send({ embeds: [embed] });
                break;
            }
        }
    } catch (err) {
        log(`Error en comando ${command}: ${err.message}`);
    }
});

// ==================== EXPRESS ====================
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.status(200).send('Bot funcionando.'));
app.listen(port, '0.0.0.0', () => log(`Web escuchando en puerto ${port}`));

client.login(TOKEN);

