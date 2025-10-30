const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
require('dotenv').config();

// === CONFIGURACIÓN BASE ===
const TOKEN = process.env.DISCORD_TOKEN;
const CONFIG_PATH = './config.json';
const prefix = '!';

// --- FUNCIONES AUXILIARES ---
function log(msg) {
  const time = new Date().toISOString().replace('T', ' ').split('.')[0];
  console.log(`[${time}] ${msg}`);
}

// Cargar config de forma segura
let config = {};
try {
  if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    log('✅ Configuración cargada correctamente.');
  } else {
    log('⚠️ No existe config.json, creando uno nuevo.');
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({}, null, 2));
  }
} catch (error) {
  log(`❌ Error al cargar config.json: ${error.message}`);
  config = {}; // Evita que el bot se caiga
}

// Guardar config con manejo de errores
function saveConfig(key, newSettings) {
  config[key] = newSettings;
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    log(`💾 Configuración de "${key}" guardada correctamente.`);
  } catch (error) {
    log(`❌ Error al guardar configuración: ${error.message}`);
  }
}

// --- CONSTANTES VISUALES ---
const EMOTRANS = '<:cosotrans:1432794205884911788>';
const ZWS = '⠀';
const lineaDecorativa = ` ${ZWS}✨⁺.｡°${EMOTRANS} + . ° ﹒✨⁺.｡°${EMOTRANS} ${ZWS}\n`;
const enlaces =
  `${ZWS} [**Reglas**](https://discord.com/channels/1432536513370919057/1432536515237380201)` +
  ` ${ZWS.repeat(2)} [**Anuncios**](https://discord.com/channels/1432536513370919057/1432536515237380197)` +
  ` ${ZWS.repeat(2)} [**Chat**](https://discord.com/channels/1432536513370919057/1432536515237380197)`;

// --- PERMISOS ---
function checkPermissions(member) {
  return member.permissions.has(['Administrator', 'ManageGuild', 'ManageMessages']);
}

// --- ENVÍO DE MENSAJES ---
function enviarMensaje(member, tipo, testChannel = null) {
  const settings = config[tipo];
  if (!settings || !settings.embedJson) return;

  const targetChannel = testChannel || member.guild.channels.cache.get(settings.canalId);
  if (!targetChannel) return;

  try {
    let jsonString = JSON.stringify(settings.embedJson);
    jsonString = jsonString
      .replace(/{usuario}/g, `<@${member.user.id}>`)
      .replace(/{nombreUsuario}/g, member.user.username)
      .replace(/{miembrosTotales}/g, member.guild.memberCount.toString())
      .replace(/{lineaDecorativa}/g, lineaDecorativa)
      .replace(/{enlaces}/g, enlaces);

    const embedData = JSON.parse(jsonString);
    const embedToSend = EmbedBuilder.from(embedData);
    if (!embedData.timestamp) embedToSend.setTimestamp();

    if (embedData.image && embedData.image.url) embedToSend.setImage(embedData.image.url);
    targetChannel.send({ embeds: [embedToSend] });
  } catch (error) {
    log(`❌ Error al enviar mensaje de ${tipo}: ${error.message}`);
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
  log(`🤖 Bot iniciado como ${client.user.tag}`);
});

// --- EVENTOS AUTOMÁTICOS ---
client.on(Events.GuildMemberAdd, (member) => enviarMensaje(member, 'bienvenida'));
client.on(Events.GuildMemberRemove, (member) => enviarMensaje(member, 'despedida'));

// === COMANDOS ===
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  const adminCommands = ['setwelcome', 'setbye', 'test1', 'test2', 'testembed', 'showconfig', 'send'];
  const isAdminCommand = adminCommands.includes(command);

  if (isAdminCommand && !checkPermissions(message.member)) {
    return message.react('❌').catch(() => {});
  }

  try {
    switch (command) {
      case 'test1':
      case 'testwelcome':
        enviarMensaje(message.member, 'bienvenida', message.channel);
        message.channel.send('✅ Prueba de **Bienvenida** enviada.');
        break;

      case 'test2':
      case 'testbye':
        enviarMensaje(message.member, 'despedida', message.channel);
        message.channel.send('✅ Prueba de **Despedida** enviada.');
        break;

      case 'testembed':
        const testEmbed = {
          title: '🐙 Prueba de Embed',
          description: 'Este es un embed de prueba enviado por `!testembed`.',
          color: 3447003,
        };
        await message.channel.send({ embeds: [EmbedBuilder.from(testEmbed)] });
        break;

      case 'showconfig':
        message.channel.send(`\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``);
        break;

      case 'setwelcome':
      case 'setbye': {
        const key = command === 'setwelcome' ? 'bienvenida' : 'despedida';
        let channelId = args[0];
        if (channelId?.startsWith('<#') && channelId.endsWith('>')) {
          channelId = channelId.slice(2, -1);
        }

        const jsonText = message.content.slice(command.length + 2 + (args[0]?.length || 0)).trim();
        if (!channelId || !jsonText) {
          return message.reply(`Uso: \`!${command} #canal <JSON de Embed>\``);
        }

        const targetChannel = message.guild.channels.cache.get(channelId);
        if (!targetChannel) {
          return message.reply('❌ Canal inválido.');
        }

        try {
          const jsonString = jsonText.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(jsonString);
          saveConfig(key, { canalId: channelId, embedJson: parsed });
          message.reply(`✅ ${key} configurada correctamente.`);
          enviarMensaje(message.member, key, message.channel);
        } catch (error) {
          message.channel.send(`❌ Error en el JSON: ${error.message}`);
        }
        break;
      }

      case 'send': {
        let channelId = args[0];
        if (channelId?.startsWith('<#') && channelId.endsWith('>')) {
          channelId = channelId.slice(2, -1);
        }

        const targetChannel = message.guild.channels.cache.get(channelId);
        const content = message.content.slice(command.length + 2 + (args[0]?.length || 0)).trim();

        if (!targetChannel || !content) {
          return message.reply('Uso: `!send #canal <mensaje o JSON de embed>`');
        }

        setTimeout(() => message.delete().catch(() => {}), 200);

        try {
          let messageOptions = { content };
          if (content.startsWith('{') && content.endsWith('}')) {
            const jsonString = content.replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(jsonString);
            messageOptions = parsed;

            if (parsed.embeds && Array.isArray(parsed.embeds)) {
              messageOptions.embeds = parsed.embeds.map((e) => {
                const embed = EmbedBuilder.from(e);
                if (e.image?.url) embed.setImage(e.image.url);
                if (e.thumbnail?.url) embed.setThumbnail(e.thumbnail.url);
                return embed;
              });
            }
          }

          await targetChannel.send(messageOptions);
          message.channel.send(`✅ Mensaje enviado a <#${channelId}>.`);
        } catch (error) {
          message.channel.send(`❌ Error al enviar: ${error.message}`);
        }
        break;
      }
    }
  } catch (err) {
    log(`❌ Error en comando ${command}: ${err.message}`);
  }
});

// --- SERVIDOR WEB PARA UPTIME ROBOT ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.status(200).send('Bot de Discord funcionando.'));
app.listen(port, '0.0.0.0', () => log(`🌐 Web escuchando en puerto ${port}`));

client.login(TOKEN);
