const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
require('dotenv').config();

// --- CONFIGURACIÓN DE ARCHIVO ---
const TOKEN = process.env.DISCORD_TOKEN;
const CONFIG_PATH = './config.json';
let config = {};

try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (error) {
  console.error('Error al cargar config.json. Asegúrate de que el archivo existe.');
  process.exit(1);
}

// --- CONSTANTES DE FORMATO (Muestra igual en Discord) ---
const EMOTRANS = '<:cosotrans:1432794205884911788>';
const ZWS = '⠀';
const prefix = '!';

const lineaDecorativa = ` ${ZWS}✨⁺.｡°${EMOTRANS} + . ° ﹒✨⁺.｡°${EMOTRANS} ${ZWS}\n`;
const enlaces =
  `${ZWS} [**Reglas**](https://discord.com/channels/1432536513370919057/1432536515237380201)` +
  ` ${ZWS.repeat(2)} [**Anuncios**](https://discord.com/channels/1432536513370919057/1432536515237380197)` +
  ` ${ZWS.repeat(2)} [**Chat**](https://discord.com/channels/1432536513370919057/1432536515237380197)`;

// --- FUNCIONES CENTRALES ---

/**
 * Verifica permisos de moderación/administración.
 */
function checkPermissions(member) {
  return member.permissions.has(['Administrator', 'ManageGuild', 'ManageMessages']);
}

function saveConfig(key, newSettings) {
  config[key] = newSettings;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Prepara y envía mensajes de bienvenida/despedida.
 */
function enviarMensaje(member, tipo, testChannel = null) {
  const settings = config[tipo];
  if (!settings || !settings.embedJson) return;

  const targetChannel = testChannel || (settings.canalId ? member.guild.channels.cache.get(settings.canalId) : null);
  if (!targetChannel) return;

  // Reemplazo de variables
  let jsonString = JSON.stringify(settings.embedJson);
  jsonString = jsonString
    .replace(/{usuario}/g, `<@${member.user.id}>`)
    .replace(/{nombreUsuario}/g, member.user.username)
    .replace(/{miembrosTotales}/g, member.guild.memberCount.toString())
    .replace(/{lineaDecorativa}/g, lineaDecorativa)
    .replace(/{enlaces}/g, enlaces);

  try {
    const embedData = JSON.parse(jsonString);
    const embedToSend = EmbedBuilder.from(embedData);
    if (!embedData.timestamp) embedToSend.setTimestamp();

    // FIX DE IMAGEN AÑADIDO (para asegurar la carga)
    if (embedData.image && embedData.image.url) {
        embedToSend.setImage(embedData.image.url);
    }

    targetChannel.send({ embeds: [embedToSend] });
  } catch (error) {
    console.error(`Error al parsear o enviar el embed de ${tipo}:`, error);
  }
}

// --- CLIENTE DISCORD ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`Bot encendido como ${client.user.tag}`);
});

// EVENTOS AUTOMÁTICOS
client.on(Events.GuildMemberAdd, (member) => {
  enviarMensaje(member, 'bienvenida');
});

client.on(Events.GuildMemberRemove, (member) => {
  enviarMensaje(member, 'despedida');
});

// --- MANEJO DE COMANDOS ---
client.on(Events.MessageCreate, (message) => {
    if (message.author.bot || !message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    const isAdminCommand = ['setwelcome', 'setbye', 'test1', 'test2', 'testembed', 'showconfig', 'send'].includes(command);

    if (isAdminCommand && !checkPermissions(message.member)) {
        return;
    }

    // Comandos de PRUEBA
    switch (command) {
        case 'test1':
        case 'testwelcome':
            enviarMensaje(message.member, 'bienvenida', message.channel);
            message.channel.send("✅ Prueba de **Bienvenida** enviada al canal actual.");
            break;

        case 'test2':
        case 'testbye':
            enviarMensaje(message.member, 'despedida', message.channel);
            message.channel.send("✅ Prueba de **Despedida** enviada al canal actual.");
            break;

        case 'testembed':
            const testEmbedJson = { "title": "🐙 Prueba de Embed Personalizado", "description": "Este es un embed de prueba enviado por `!testembed`.", "color": 3447003 };
            message.channel.send({ embeds: [EmbedBuilder.from(testEmbedJson)] })
                .then(() => message.channel.send("✅ Prueba de **Embed genérico** enviada al canal actual."));
            break;

        case 'showconfig':
            message.channel.send(`\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``);
            break;
    }

    // Lógica para setwelcome y setbye
    if (['setwelcome', 'setbye'].includes(command)) {
        const key = command === 'setwelcome' ? 'bienvenida' : 'despedida';
        const newChannelId = args[0];
        const newEmbedJson = message.content.slice(command.length + 2 + (args[0]?.length || 0)).trim();
        let channelId = newChannelId;

        if (newChannelId && newChannelId.startsWith('<#') && newChannelId.endsWith('>')) {
            channelId = newChannelId.slice(2, -1);
        }

        const targetChannel = message.guild.channels.cache.get(channelId);

        if (!targetChannel || !newEmbedJson) {
            return message.reply(`Uso: \`!${command} #canal <JSON de Embed>\``);
        }

        try {
            const jsonString = newEmbedJson.replace(/```json|```/g, '').trim();
            const validatedJson = JSON.parse(jsonString);

            saveConfig(key, { canalId: channelId, embedJson: validatedJson });

            message.reply(`✅ **${key.charAt(0).toUpperCase() + key.slice(1)} Actualizada.** Enviando prueba al canal actual.`);
            enviarMensaje(message.member, key, message.channel);

        } catch (error) {
            message.channel.send(`❌ Error: El JSON no es válido. Error: ${error.message}`);
        }
    }


    // Lógica del comando !send (Acepta JSON completo de mensaje)
    if (command.startsWith('send')) {
        let channelId = args[0];
        if (channelId && channelId.startsWith('<#') && channelId.endsWith('>')) {
            channelId = channelId.slice(2, -1);
        }

        const content = message.content.slice(command.length + 2 + (args[0]?.length || 0)).trim();

        const targetChannel = message.guild.channels.cache.get(channelId);

        if (!targetChannel || !content) {
            return message.reply(`Uso: \`!send #canal <Mensaje o JSON de Embed>\``);
        }

        message.delete().catch(() => {});

        try {
            let messageOptions = { content: content };
            let isJson = false;

            if (content.startsWith('{') && content.endsWith('}')) {
                const jsonString = content.replace(/```json|```/g, '').trim();
                let parsedContent = JSON.parse(jsonString);
                isJson = true;

                // Si es un JSON, lo usamos como opciones de mensaje
                messageOptions = parsedContent;

                // Convertir embeds JSON a objetos EmbedBuilder
                if (messageOptions.embeds && Array.isArray(messageOptions.embeds)) {
                    messageOptions.embeds = messageOptions.embeds.map(e => {
                        const embedToSend = EmbedBuilder.from(e);
                        // Aplicar los mismos FIX de imagen para !send
                        if (e.image && e.image.url) embedToSend.setImage(e.image.url);
                        if (e.thumbnail && e.thumbnail.url) embedToSend.setThumbnail(e.thumbnail.url);
                        return embedToSend;
                    });
                }
            }
            
            // Si no era JSON, enviamos el contenido como texto. Si era JSON, enviamos las opciones parseadas.
            targetChannel.send(messageOptions)
                .then(() => message.channel.send(`Mensaje enviado a <#${channelId}>.`))
                .catch(error => {
                    message.channel.send(`Error al enviar a <#${channelId}>: ${error.message}`);
                });

        } catch (error) {
            message.channel.send(`❌ Error: El contenido no es un JSON válido. Error: ${error.message}`);
        }
    }
});


// --- SERVIDOR WEB ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Bot de Discord funcionando.');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Servidor web escuchando en 0.0.0.0:${port}`);
});

client.login(TOKEN);
