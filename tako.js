const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
require('dotenv').config();

// CONFIGURACIÓN GLOBAL
const TOKEN = process.env.DISCORD_TOKEN;
const CONFIG_PATH = './config.json';

let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (error) {
  console.error('Error al cargar config.json. Asegúrate de que el archivo existe.');
  process.exit(1);
}

// CONSTANTES
const EMOTRANS = '<:cosotrans:1432794205884911788>';
const ZWS = '⠀';

const lineaDecorativa = ` ${ZWS}✨⁺.｡°${EMOTRANS} + . ° ﹒✨⁺.｡°${EMOTRANS} ${ZWS}\n`;
const enlaces =
  `${ZWS} [**Reglas**](https://discord.com/channels/1432536513370919057/1432536515237380201)` +
  ` ${ZWS.repeat(2)} [**Anuncios**](https://discord.com/channels/1432536513370919057/1432536515237380197)` +
  ` ${ZWS.repeat(2)} [**Chat**](https://discord.com/channels/1432536513370919057/1432536515237380197)`;

// FUNCIONES
/**
 * Verifica si el miembro tiene permisos de gestión (Administrador, Gestionar Servidor o Gestionar Mensajes).
 */
function checkPermissions(member) {
  const permisos = member.permissions;
  return permisos.has('Administrator') ||
    permisos.has('ManageGuild') ||
    permisos.has('ManageMessages'); // Ahora incluye ManageMessages
}

/**
 * Función central para enviar mensajes de bienvenida/despedida.
 * @param {GuildMember} member - El miembro que se une/va.
 * @param {string} tipo - 'bienvenida' o 'despedida'.
 * @param {TextChannel} [testChannel=null] - Canal opcional para enviar prueba (si no es null, ignora settings.canalId).
 */
function enviarMensaje(member, tipo, testChannel = null) {
  const settings = config[tipo];
  if (!settings || !settings.embedJson) return;
  
  // Si estamos haciendo una prueba, usamos el canal de prueba. Si no, usamos el canal configurado.
  const targetChannel = testChannel || (settings.canalId ? member.guild.channels.cache.get(settings.canalId) : null);
  if (!targetChannel) return;

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
    
    // FIX DE IMAGEN AÑADIDO
    if (embedData.image && embedData.image.url) {
        embedToSend.setImage(embedData.image.url);
    }
    
    targetChannel.send({ embeds: [embedToSend] });
  } catch (error) {
    console.error(`Error al parsear o enviar el embed de ${tipo}:`, error);
  }
}

function saveConfig(key, newSettings) {
  config[key] = newSettings;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}


// CLIENTE DISCORD
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

// MANEJO DE COMANDOS
client.on(Events.MessageCreate, (message) => {
    if (message.author.bot) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return; // Ignora cualquier mensaje que no sea un comando.

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    // Comandos que requieren permisos de Moderador/Admin
    const isAdminCommand = ['setwelcome', 'setbye', 'test1', 'test2', 'testembed', 'showconfig', 'send'].includes(command);
    
    if (isAdminCommand && !checkPermissions(message.member)) {
        return; // Silencio: si no tiene permisos, simplemente no hace nada.
    }
    
    // PRUEBAS Y UTILIDADES
    switch (command) {
        case 'test1': 
        case 'testwelcome':
            // ENVÍA PRUEBA AL CANAL DONDE SE EJECUTÓ EL COMANDO
            enviarMensaje(message.member, 'bienvenida', message.channel);
            message.channel.send("✅ Prueba de **Bienvenida** enviada al canal actual.");
            break;

        case 'test2': 
        case 'testbye':
            // ENVÍA PRUEBA AL CANAL DONDE SE EJECUTÓ EL COMANDO
            enviarMensaje(message.member, 'despedida', message.channel);
            message.channel.send("✅ Prueba de **Despedida** enviada al canal actual.");
            break;
            
        case 'testembed':
            const testEmbedJson = {
                "title": "🐙 Prueba de Embed Personalizado",
                "description": "Este es un embed de prueba enviado por `!testembed`.",
                "color": 3447003,
            };
            const embedToSend = EmbedBuilder.from(testEmbedJson);
            
            message.channel.send({ embeds: [embedToSend] })
                .then(() => message.channel.send("✅ Prueba de **Embed genérico** enviada al canal actual."));
            break;
        
        case 'showconfig':
            const configDisplay = JSON.stringify(config, null, 2);
            message.channel.send(`\`\`\`json\n${configDisplay}\n\`\`\``);
            break;
    }
    
    // COMANDO setwelcome
    if (command === 'setwelcome') {
        const newChannelId = args[0];
        const newEmbedJson = message.content.slice(command.length + 2 + (args[0]?.length || 0)).trim(); 
        let channelId;

        if (newChannelId && newChannelId.startsWith('<#') && newChannelId.endsWith('>')) {
            channelId = newChannelId.slice(2, -1);
        } else {
            channelId = newChannelId;
        }
        
        const targetChannel = message.guild.channels.cache.get(channelId);

        if (!targetChannel || !newEmbedJson) {
            return message.reply(`Uso: \`!setwelcome #canal <JSON de Embed>\``);
        }

        try {
            const jsonString = newEmbedJson.replace(/```json|```/g, '').trim();
            const validatedJson = JSON.parse(jsonString);

            saveConfig('bienvenida', { canalId: channelId, embedJson: validatedJson });
            
            message.reply(`✅ **Bienvenida Actualizada.** Enviando prueba al canal actual.`);
            // ENVÍA PRUEBA AL CANAL DONDE SE EJECUTÓ EL COMANDO
            enviarMensaje(message.member, 'bienvenida', message.channel); 

        } catch (error) {
            message.channel.send(`❌ Error: El JSON no es válido. Error: ${error.message}`);
        }
    }


    // COMANDO setbye
    if (command === 'setbye') {
        const newChannelId = args[0];
        const newEmbedJson = message.content.slice(command.length + 2 + (args[0]?.length || 0)).trim();
        let channelId;

        if (newChannelId && newChannelId.startsWith('<#') && newChannelId.endsWith('>')) {
            channelId = newChannelId.slice(2, -1);
        } else {
            channelId = newChannelId;
        }
        
        const targetChannel = message.guild.channels.cache.get(channelId);

        if (!targetChannel || !newEmbedJson) {
            return message.reply(`Uso: \`!setbye #canal <JSON de Embed>\``);
        }

        try {
            const jsonString = newEmbedJson.replace(/```json|```/g, '').trim();
            const validatedJson = JSON.parse(jsonString);

            saveConfig('despedida', { canalId: channelId, embedJson: validatedJson });
            
            message.reply(`✅ **Despedida Actualizada.** Enviando prueba al canal actual.`);
            // ENVÍA PRUEBA AL CANAL DONDE SE EJECUTÓ EL COMANDO
            enviarMensaje(message.member, 'despedida', message.channel); 

        } catch (error) {
            message.channel.send(`❌ Error: El JSON no es válido. Error: ${error.message}`);
        }
    }


    // COMANDO send
    if (command.startsWith('send')) {
        // La verificación de permisos se hizo al inicio del MessageCreate, si llegó aquí, es un Admin.
        
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
            let messageOptions = {};
            let isEmbed = false;
            
            if (content.startsWith('{') && content.endsWith('}')) {
                const jsonString = content.replace(/```json|```/g, '').trim();
                const embedData = JSON.parse(jsonString);
                
                if (embedData.title || embedData.description || embedData.fields || embedData.author) {
                    const embedToSend = EmbedBuilder.from(embedData);
                    
                    // FIX DE IMAGEN AÑADIDO
                    if (embedData.image && embedData.image.url) {
                        embedToSend.setImage(embedData.image.url);
                    }
                    
                    messageOptions = { embeds: [embedToSend] };
                    isEmbed = true;
                }
            }
            
            if (!isEmbed) {
                messageOptions = { content: content };
            }
            
            targetChannel.send(messageOptions)
                .then(() => message.channel.send(`Mensaje enviado a <#${channelId}>.`))
                .catch(error => {
                    message.channel.send(`Error al enviar a <#${channelId}>: ${error.message}`);
                });

        } catch (error) {
            message.channel.send(`El contenido no es un Embed JSON válido. Error: ${error.message}`);
        }
    }
});


// SERVIDOR WEB
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Bot de Discord funcionando.');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Servidor web escuchando en 0.0.0.0:${port}`);
});

client.login(TOKEN);
