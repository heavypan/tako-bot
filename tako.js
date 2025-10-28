const { Client, GatewayIntentBits, Events, EmbedBuilder } = require('discord.js');
require('dotenv').config();
const TOKEN = process.env.DISCORD_TOKEN;
const CANAL_BIENVENIDA = '1432548239743385672';


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


const IMAGEN_PULPO_URL = 'https://media.discordapp.net/attachments/1419865223141134339/1432805608851111976/image.png?ex=690263b5&is=69011235&hm=97787b3aef2870bc73710570442a31cfc62ff80f770977e49e645eb9e0179467&=&format=webp&quality=lossless&width=960&height=960'; 
const ICONO_GRANDE_URL = 'https://cdn.discordapp.com/attachments/1419865223141134339/1432804344310399026/image.png?ex=69026287&is=69011107&hm=4bd8ac7c77afaa8e1a3c5fd4562ea89681fd1d1148a5e6dfd74b2d9f9f7ea3bc'; 
const EMOTRANS = '<:cosotrans:1432794205884911788>';
const ZWS = '⠀'; 


function enviarBienvenida(member, canal = null) {
  const targetChannel = canal || member.guild.channels.cache.get(CANAL_BIENVENIDA);
  if (!targetChannel) return;

  const lineaDecorativa = ` ${ZWS}✨⁺.｡°${EMOTRANS} + . ° ﹒✨⁺.｡°${EMOTRANS} ${ZWS}\n`;

  const enlaces =
    `${ZWS} [**Reglas**](https://discord.com/channels/1432536513370919057/1432536515237380201)` +
    ` ${ZWS.repeat(2)} [**Anuncios**](https://discord.com/channels/1432536513370919057/1432536515237380197)` +
    ` ${ZWS.repeat(2)} [**Chat**](https://discord.com/channels/1432536513370919057/1432536515237380197)`;

  const embed = new EmbedBuilder()
    .setAuthor({ name: `Bienvenido a Takoiyaki-Land!! ツ ⁝ 🏮 ･ﾟ` })
    .setThumbnail(ICONO_GRANDE_URL)
    .setDescription(
      `**¡Hola, <@${member.user.id}>!**\n\n` +
      `Hacemos revival del servidor.... Bienvenidos!!!!!!!!\n\n` +
      lineaDecorativa + '\n' + enlaces
    )
    .setColor('#A42020')
    .setImage(IMAGEN_PULPO_URL);

  targetChannel.send({ embeds: [embed] });
}
client.on(Events.GuildMemberAdd, (member) => {
  enviarBienvenida(member);
});

client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;
  const permisos = message.member.permissions;
  if (!permisos.has('Administrator') &&
      !permisos.has('ManageGuild') &&
      !message.member.roles.cache.some(r => ['Mod','Admin','Owner'].includes(r.name))) {
      return message.reply("❌ No tienes permisos para usar este bot.");
  }

  if (message.content.toLowerCase() === '!test1') {
    const memberFake = {
      user: {
        id: message.author.id,
        username: message.author.username,
      },
      guild: message.guild,
    };
    enviarBienvenida(memberFake, message.channel);
  }

  const prefix = '!send';
  if (message.content.startsWith(prefix)) {
    
    const parts = message.content.slice(prefix.length).trim().split(/\s+/);
    
    let channelId = parts[0];
    if (channelId.startsWith('<#') && channelId.endsWith('>')) {
        channelId = channelId.slice(2, -1);
    }
    
    const content = message.content.slice(prefix.length + parts[0].length).trim();
    
    const targetChannel = message.guild.channels.cache.get(channelId);

    if (!targetChannel || !content) {
        return message.reply(`Uso incorrecto \nDebes especificar el canal y el mensaje`);
    }
    
    message.delete().catch(() => {});

    try {
        let messageOptions = {};
        let isEmbed = false;
        
        if (content.startsWith('{') && content.endsWith('}')) {
            const jsonString = content.replace(/```json|```/g, '').trim();
            const embedData = JSON.parse(jsonString);
            if (embedData.title || embedData.description || embedData.fields) {
                const embedToSend = EmbedBuilder.from(embedData);
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
                console.error('Error al enviar el mensaje:', error);
                message.channel.send(`Error al enviar el mensaje a <#${channelId}>: ${error.message}`);
            });

    } catch (error) {
        message.channel.send(`El contenido no es un Embed JSON válido ni un mensaje de texto. Error: ${error.message}`);
    }
  }
});

client.login(TOKEN);
