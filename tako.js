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
    embed.embeds[0].description = embed.embeds[0].description
      .replace(/{usuario}/g, `<@${member.id}>`)
      .replace(/{nombreUsuario}/g, member.user.username)
      .replace(/{miembrosTotales}/g, member.guild.memberCount.toString());
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

  const adminCommands = ['setwelcome', 'setbye', 'testwelcome', 'testbye', 'showconfig'];

  if (adminCommands.includes(command) && !checkPermissions(message.member))
    return message.reply('❌ No tienes permisos para usar este comando.');

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

      case 'testwelcome':
      case 'testbye': {
        const tipo = command === 'testwelcome' ? 'bienvenida' : 'despedida';
        enviarEmbed(message.member, tipo, message.channel);
        break;
      }

      case 'showconfig':
        message.channel.send(`\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``);
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
