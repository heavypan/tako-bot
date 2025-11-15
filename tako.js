const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const express = require('express');
require('dotenv').config();

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
    return member.permissions.has(['Administrator', 'ManageGuild', 'ManageMessages']);
}

// Función para enviar embed dinámico reemplazando placeholders
function enviarEmbed(member, tipo, testChannel = null) {
    const settings = config[tipo];
    if (!settings || !settings.embedJson) return;

    const targetChannel = testChannel || member.guild.channels.cache.get(settings.canalId);
    if (!targetChannel) return;
    
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

    // ----------------------------------------------------------------------
    // MODIFICACIÓN DE PERMISOS: Ignorar si no tiene permisos
    // Si el comando es de administración Y el miembro NO tiene permisos:
    if (adminCommands.includes(command) && !checkPermissions(message.member))
        return; // Simplemente retorna sin enviar ningún mensaje de error
    // ----------------------------------------------------------------------

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

            // ==================== COMANDO !SEND ====================
            case 'send': {
                let channelId = args[0];
                if (channelId?.startsWith('<#') && channelId.endsWith('>'))
                    channelId = channelId.slice(2, -1);

                const channelMentionLength = args[0] ? args[0].length : 0;
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
                enviarEmbed(message.member, tipo, message.channel);
                break;
            }

            case 'showconfig':
                message.channel.send(`\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``);
                break;
                
            // ==================== NUEVO COMANDO !HELP ====================
            case 'help': {
                const embed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle('🐙 Comandos de Tako Bot')
                    .setDescription(`Mi prefijo es: \`${prefix}\``)
                    .addFields(
                        { 
                            name: '🛠️ Comandos de Administración (Requiere permisos)', 
                            value: `
                            \`${prefix}setwelcome #canal <JSON>\` - Configura el embed de bienvenida.
                            \`${prefix}setbye #canal <JSON>\` - Configura el embed de despedida.
                            \`${prefix}testwelcome\` - Prueba el embed de bienvenida en este canal.
                            \`${prefix}testbye\` - Prueba el embed de despedida en este canal.
                            \`${prefix}send #canal <mensaje/JSON>\` - Envía un mensaje o embed al canal.
                            \`${prefix}showconfig\` - Muestra la configuración actual (temporal).
                            `
                        },
                        {
                            name: '✨ Comandos Generales',
                            value: `
                            \`${prefix}help\` - Muestra esta lista de comandos.
                            `
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Gracias por usar Tako!' });
                    
                message.channel.send({ embeds: [embed] });
                break;
            }
            // =============================================================
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
