const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
const express = require('express');
const fs = require('fs');
require('dotenv').config();

// === CONFIGURACIÓN BASE ===
const TOKEN = process.env.DISCORD_TOKEN;
const CONFIG_PATH = './config.json';
const prefix = '!';

// # Logs con hora
function log(msg) {
  const time = new Date().toISOString().replace('T', ' ').split('.')[0];
  console.log(`[${time}] ${msg}`);
}

// # Cargar configuración de forma segura
let config = {};
try {
  if (fs.existsSync(CONFIG_PATH)) {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    log('Configuración cargada correctamente.');
  } else {
    log('No existe config.json, creando uno nuevo.');
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({}, null, 2));
  }
} catch (error) {
  log(`Error al cargar config.json: ${error.message}`);
  config = {};
}

// # Guardar configuración
function saveConfig(key, newSettings) {
  config[key] = newSettings;
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    log(`Configuración de "${key}" guardada correctamente.`);
  } catch (error) {
    log(`Error al guardar configuración: ${error.message}`);
  }
}

// === CONSTANTES VISUALES ===
const EMOTRANS = '<:cosotrans:1432794205884911788>';
const ZWS = '⠀';
const lineaDecorativa = ` ${ZWS}✨⁺.｡°${EMOTRANS} + . ° ﹒✨⁺.｡°${EMOTRANS} ${ZWS}\\n`;
const enlaces =
  `${ZWS} [**Reglas**](https://discord.com/channels/1432536513370919057/1432536515237380201)` +
  ` ${ZWS.repeat(2)} [**Anuncios**](https://discord.com/channels/1432536513370919057/1432536515237380197)` +
  ` ${ZWS.repeat(2)} [**Chat**](https://discord.com/channels/1432536513370919057/1432536515237380197)`;

// === PERMISOS ===
function checkPermissions(member) {
  return member.permissions.has(['Administrator', 'ManageGuild', 'ManageMessages']);
}

// === CONVERTIDOR DE JSON DE DISCOHOOK ===
function convertirDiscohook(jsonDiscohook, member = null) {
  let data;
  if (typeof jsonDiscohook === 'string') {
    try {
      data = JSON.parse(jsonDiscohook);
    } catch (e) {
      console.error('Error al parsear JSON de Discohook:', e.message);
      return null;
    }
  } else {
    data = jsonDiscohook;
  }

  if (!data.embeds || !Array.isArray(data.embeds) || data.embeds.length === 0) {
    console.error('El JSON de Discohook no tiene embeds válidos.');
    return null;
  }

  let embed = data.embeds[0];

  if (member) {
    embed.description = embed.description
      ?.replace(/{usuario}/g, `<@${member.user.id}>`)
      .replace(/{nombreUsuario}/g, member.user.username)
      .replace(/{miembrosTotales}/g, member.guild.memberCount.toString())
      .replace(/{lineaDecorativa}/g, lineaDecorativa)
      .replace(/{enlaces}/g, enlaces);
  }

  try {
    return EmbedBuilder.from(embed);
  } catch (err) {
    console.error('Error al convertir a EmbedBuilder:', err.message);
    return null;
  }
}

// === ENVÍO DE MENSAJES ===
function enviarMensaje(member, tipo, testChannel = null) {
  const settings = config[tipo];
  if (!settings || !settings.embedJson) return;

  const targetChannel = testChannel || member.guild.channels.cache.get(settings.canalId);
  if (!targetChannel) return;

  const embedToSend = convertirDiscohook(settings.embedJson, member);
  if (!embedToSend) return;

  if (!embedToSend.data.timestamp) embedToSend.setTimestamp();
  targetChannel.send({ embeds: [embedToSend] });
}

// === CLIENTE DISCORD ===
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

// === EVENTOS AUTOMÁTICOS ===
client.on(Events.GuildMemberAdd, (member) => enviarMensaje(member, 'bienvenida'));
client.on(Events.GuildMemberRemove, (member) => enviarMensaje(member, 'despedida'));

// === COMANDOS ===
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  const adminCommands = ['setwelcome','setbye','testwelcome','testbye','testembed','showconfig','send','status','checkjson'];
  const isAdminCommand = adminCommands.includes(command);

  if (isAdminCommand && !checkPermissions(message.member)) return message.react('❌').catch(() => {});

  try {
    switch (command) {
      case 'testwelcome':
      case 'testbye': {
        const tipo = command === 'testwelcome' ? 'bienvenida' : 'despedida';
        enviarMensaje(message.member, tipo, message.channel);
        message.react('✅');
        break;
      }

      case 'testembed': {
        const testEmbed = { title:'Prueba de Embed', description:'Embed de prueba enviado con !testembed', color:3447003 };
        await message.channel.send({ embeds: [EmbedBuilder.from(testEmbed)] });
        break;
      }

      case 'showconfig':
        message.channel.send(`\`\`\`json\n${JSON.stringify(config,null,2)}\n\`\`\``);
        break;

      case 'setwelcome':
      case 'setbye': {
        const key = command === 'setwelcome' ? 'bienvenida' : 'despedida';
        let channelId = args[0];
        if (channelId?.startsWith('<#') && channelId.endsWith('>')) channelId = channelId.slice(2,-1);

        const jsonText = message.content.slice(command.length + 2 + (args[0]?.length||0)).trim();
        if (!channelId || !jsonText) return message.reply(`Uso: \`!${command} #canal <JSON de Embed>\``);

        const targetChannel = message.guild.channels.cache.get(channelId);
        if (!targetChannel) return message.reply('Canal inválido.');

        try {
          const jsonString = jsonText.replace(/```json|```/g,'').trim();
          const parsed = JSON.parse(jsonString);
          if (!parsed.embeds || !Array.isArray(parsed.embeds)) return message.reply('El JSON debe contener un array llamado "embeds".');
          saveConfig(key,{ canalId: channelId, embedJson: parsed });
          message.reply(`${key} configurada correctamente.`);
          enviarMensaje(message.member, key, message.channel);
        } catch (error) {
          message.channel.send(`Error en el JSON: ${error.message}`);
        }
        break;
      }

      case 'send': {
        let channelId = args[0];
        if (channelId?.startsWith('<#') && channelId.endsWith('>')) channelId = channelId.slice(2,-1);

        const targetChannel = message.guild.channels.cache.get(channelId);
        const content = message.content.slice(command.length + 2 + (args[0]?.length||0)).trim();
        if (!targetChannel || !content) return message.reply('Uso: `!send #canal <mensaje o JSON de embed>`');

        try {
          await message.delete().catch(()=>{});
          let messageOptions = { content };
          if (content.startsWith('{') && content.endsWith('}')) {
            const parsed = JSON.parse(content.replace(/```json|```/g,'').trim());
            const embedFinal = convertirDiscohook(parsed,message.member);
            if(embedFinal) messageOptions = { embeds: [embedFinal] };
          }
          await targetChannel.send(messageOptions);
          message.react('✅');
        } catch (error) {
          message.channel.send(`Error al enviar: ${error.message}`);
        }
        break;
      }

      case 'status':
      case 'help': {
        const statusMsg = '**Comandos disponibles:**\n' +
          '`!setwelcome`, `!setbye`, `!testwelcome`, `!testbye`, `!testembed`, `!showconfig`, `!send`, `!checkjson`\n\n' +
          '**Configuraciones actuales:**\n' +
          Object.entries(config).map(([k,v])=>`• ${k}: <#${v.canalId||'sin canal'}>`).join('\n');
        message.channel.send(statusMsg);
        break;
      }

      case 'checkjson': {
        if(Object.keys(config).length===0) return message.reply('No hay configuraciones guardadas.');
        let report='**Revisión de JSONs:**\n';
        for(const [tipo,data] of Object.entries(config)){
          try {
            const embed=data.embedJson?.embeds?.[0];
            if(!embed){ report+=`• ${tipo}: ❌ No tiene embeds válidos.\n`; continue; }
            const faltantes=[];
            if(!embed.description) faltantes.push('description');
            if(!embed.color) faltantes.push('color');
            if(!embed.title && !embed.author?.name) faltantes.push('title/author');
            report+= faltantes.length? `• ${tipo}: ⚠️ Faltan campos: ${faltantes.join(', ')}\n`:`• ${tipo}: ✅ Correcto\n`;
          } catch { report+=`• ${tipo}: ❌ Error al analizar\n`; }
        }
        message.channel.send(report);
        break;
      }

    }
  } catch (err) {
    log(`Error en comando ${command}: ${err.message}`);
  }
});

// === SERVIDOR WEB PARA RENDER/UPTIMEROBOT ===
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req,res)=>res.status(200).send('Bot de Discord funcionando.'));
app.listen(port,'0.0.0.0',()=>log(`Web escuchando en puerto ${port}`));

client.login(TOKEN);
