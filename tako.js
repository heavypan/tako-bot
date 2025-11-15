const { Client, GatewayIntentBits, Events, EmbedBuilder, ChannelType } = require('discord.js');
const express = require('express');
const { QuickDB } = require("quick.db"); // Importar Quick.db
const db = new QuickDB(); // Inicializar la DB
const configTemplates = require('./config.json'); //Cargar plantillas del archivo config.json

const TOKEN = process.env.DISCORD_TOKEN;
const prefix = '!';

function log(msg) {
    const time = new Date().toISOString().replace('T', ' ').split('.')[0];
    console.log(`[${time}] ${msg}`);
}

let config = {}; 

// ==================== FUNCIONES ====================
async function getEventConfig(key) {
    let customConfig = await db.get(key);
    // Usamos configTemplates (cargado de config.json) si no hay nada en la DB
    return customConfig || configTemplates[key];
}

function checkPermissions(member) {
    return member.permissions.has(['Administrator', 'ManageGuild', 'ManageMessages']);
}

async function enviarEmbed(member, tipo, testChannel = null) { // AÑADIDO: async
    // MODIFICACION DE BD
    const settings = await getEventConfig(tipo); // AÑADIDO: await
    
    if (!settings || !settings.embedJson) return;

    const targetChannel = testChannel || member.guild.channels.cache.get(settings.canalId);
    // AÑADIDO: Validación de canal
    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) return; 
    
    let embed = JSON.parse(JSON.stringify(settings.embedJson));

    if (member) {
        // Validación de existencia de 'description' antes de usar .replace
        if (embed.embeds && Array.isArray(embed.embeds) && embed.embeds[0] && embed.embeds[0].description) {
             embed.embeds[0].description = embed.embeds[0].description
                .replace(/{usuario}/g, `<@${member.id}>`)
                .replace(/{nombreUsuario}/g, member.user.username)
                .replace(/{miembrosTotales}/g, member.guild.memberCount.toString());
        }
    }
    
    // Si el payload tiene 'content', lo incluimos
    const sendOptions = { embeds: [EmbedBuilder.from(embed.embeds[0])] };
    if (embed.content) {
        sendOptions.content = embed.content;
    }
    
    await targetChannel.send(sendOptions); // AÑADIDO: await
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
client.on(Events.GuildMemberAdd, async (member) => { // AÑADIDO: async
    await enviarEmbed(member, 'bienvenida'); // AÑADIDO: await
});

// Evento cuando un miembro sale
client.on(Events.GuildMemberRemove, async (member) => { // AÑADIDO: async
    await enviarEmbed(member, 'despedida'); // AÑADIDO: await
});

// ==================== COMANDOS ====================
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    const adminCommands = ['setwelcome', 'setbye', 'testwelcome', 'testbye', 'showconfig', 'send'];

    if (adminCommands.includes(command) && !checkPermissions(message.member))
        return message.reply('❌ No tienes permisos para usar este comando.');

    try {
        switch (command) {
            case 'setwelcome':
            case 'setbye': {
                const key = command === 'setwelcome' ? 'bienvenida' : 'despedida';
                let channelId = args[0];
                if (channelId?.startsWith('<#') && channelId.endsWith('>')) channelId = channelId.slice(2, -1);

                // Lógica de slice ajustada para el prefix, command, y args[0]
                const jsonText = message.content.slice(prefix.length + command.length + (args[0]?.length || 0)).trim();

                if (!channelId || !jsonText)
                    return message.reply(`Uso: \`!${command} #canal <JSON de Embed>\``);

                const targetChannel = message.guild.channels.cache.get(channelId);
                if (!targetChannel) return message.reply('Canal inválido.');

                try {
                    const jsonString = jsonText.replace(/```json|```/g, '').trim();
                    const parsed = JSON.parse(jsonString); // Este es el payload de Discohook completo
                    
                    if (!parsed.embeds || !Array.isArray(parsed.embeds))
                        return message.reply('El JSON debe contener un array llamado "embeds".');

                    // ¡CAMBIO CLAVE! GUARDAR EN LA DB
                    await db.set(key, { canalId: channelId, embedJson: parsed }); // GUARDA PERSISTENTE

                    message.reply(`✅ ${key} configurada correctamente y guardada de forma persistente.`);
                } catch (error) {
                    message.reply(`Error en el JSON: ${error.message}`);
                }
                break;
            }

            // ==================== COMANDO !SEND ====================
            case 'send': {
                let channelId = args[0];
                if (channelId?.startsWith('<#') && channelId.endsWith('>'))
                    channelId = channelId.slice(2, -1);

                const channelMentionLength = args[0] ? args[0].length : 0;
                // Ajuste de offset
                const offset = prefix.length + command.length + 1 + channelMentionLength + 1; 
                const messageText = message.content.substring(offset).trim();

                if (!channelId || !messageText)
                    return message.reply(`Uso: \`!send #canal <mensaje o JSON de Embed>\``);

                const targetChannel = message.guild.channels.cache.get(channelId);
                if (!targetChannel)
                    return message.reply('Canal inválido.');

                try {
                    // Intentar parsear el mensaje como JSON
                    let parsed;
                    try {
                        const jsonString = messageText.replace(/```json|```/g, '').trim();
                        parsed = JSON.parse(jsonString);
                    } catch {
                        parsed = null;
                    }

                    const sendOptions = {};

                    if (parsed) {
                        // Si es JSON válido
                        if (parsed.content) sendOptions.content = parsed.content;
                        if (parsed.embeds && Array.isArray(parsed.embeds) && parsed.embeds.length > 0)
                            sendOptions.embeds = parsed.embeds.map(embedData => EmbedBuilder.from(embedData));

                        if (Object.keys(sendOptions).length === 0)
                            return message.reply('El JSON debe contener al menos **"content"** o un array **"embeds"** válido.');
                    } else {
                        // Si no es JSON, lo enviamos como texto normal
                        sendOptions.content = messageText;
                    }

                    await targetChannel.send(sendOptions);
                    message.react('✅');

                } catch (error) {
                    message.reply(`Error al enviar el mensaje: ${error.message}`);
                }

                break;
            }
            // ========================================================

            case 'testwelcome':
            case 'testbye': {
                const tipo = command === 'testwelcome' ? 'bienvenida' : 'despedida';
                await enviarEmbed(message.member, tipo, message.channel); // AÑADIDO: await
                break;
            }

            case 'showconfig':
                // MODIFICADO: Muestra la configuración persistente
                const welcomeConfig = await db.get('bienvenida') || configTemplates.bienvenida;
                const goodbyeConfig = await db.get('despedida') || configTemplates.despedida;
                
                const response = { bienvenida: welcomeConfig, despedida: goodbyeConfig };

                message.channel.send(`\`\`\`json\n${JSON.stringify(response, null, 2)}\n\`\`\``);
                break;
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
