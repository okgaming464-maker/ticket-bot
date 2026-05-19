require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');

const config = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const GUILD_ID = process.env.GUILD_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const CATEGORY_ID = process.env.TICKET_CATEGORY_ID;

const pendingPayments = {};

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return console.error('Guild not found');

  await guild.commands.set([
    new SlashCommandBuilder()
      .setName('buy')
      .setDescription('Open a purchase ticket'),
    new SlashCommandBuilder()
      .setName('close')
      .setDescription('Close this ticket')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
      .setName('panel')
      .setDescription('Send the buy panel embed to this channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
      .setName('adduser')
      .setDescription('Add a user to this ticket')
      .addUserOption((o) =>
        o.setName('user').setDescription('The user to add').setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
      .setName('removeuser')
      .setDescription('Remove a user from this ticket')
      .addUserOption((o) =>
        o.setName('user').setDescription('The user to remove').setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
      .setName('rename')
      .setDescription('Rename this ticket channel')
      .addStringOption((o) =>
        o.setName('name').setDescription('New channel name').setRequired(true)
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  ]);

  console.log('Slash commands registered');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.inGuild()) return;

  if (interaction.isChatInputCommand()) {
    switch (interaction.commandName) {
      case 'buy':
        return handleBuy(interaction);
      case 'close':
        return handleClose(interaction);
      case 'panel':
        return handlePanel(interaction);
      case 'adduser':
        return handleAddUser(interaction);
      case 'removeuser':
        return handleRemoveUser(interaction);
      case 'rename':
        return handleRename(interaction);
    }
  }

  if (interaction.isButton()) return handleButton(interaction);
});

function embedColor(name) {
  return config.embedColors[name] || 0x5865f2;
}

async function handlePanel(interaction) {
  const embed = new EmbedBuilder()
    .setColor(embedColor('info'))
    .setTitle('🛒 Echo.lua — Purchase')
    .setDescription(
      'Welcome to the official **Echo.lua** shop.\n\n' +
      'Click the button below to open a ticket and a staff member will assist you.'
    )
    .addFields(
      {
        name: '💎 What you get',
        value: '• Da Hood script with aim assist, silent aim, ESP, and more\n• Lifetime access\n• Free updates',
        inline: false,
      },
      {
        name: '💳 Payment Methods',
        value: '**ETH** · **BTC** · **LTC** · **USDT**',
        inline: true,
      },
      {
        name: '📦 Delivery',
        value: 'Immediate after payment confirmation',
        inline: true,
      }
    )
    .setFooter({
      text: 'Click Buy Now to start | Staff will verify your payment',
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('buy_button')
      .setLabel('Buy Now')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🛒')
  );

  await interaction.channel.send({ embeds: [embed], components: [row] });
  await interaction.reply({ content: 'Panel sent!', ephemeral: true });
}

async function createTicket(member, guild) {
  const existing = guild.channels.cache.find(
    (c) =>
      c.topic === `Ticket:${member.id}` &&
      c.parentId === CATEGORY_ID
  );
  if (existing) return existing;

  const channel = await guild.channels.create({
    name: `ticket-${member.user.username}`,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID,
    topic: `Ticket:${member.id}`,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });

  const productRows = config.products.map((p) =>
    new ButtonBuilder()
      .setCustomId(`select_${p.id}`)
      .setLabel(`${p.name} — from ${formatPrice(p)}`)
      .setStyle(ButtonStyle.Primary)
  );

  const components = [];
  for (let i = 0; i < productRows.length; i += 3) {
    components.push(
      new ActionRowBuilder().addComponents(productRows.slice(i, i + 3))
    );
  }
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    )
  );

  await channel.send({
    content: `<@${member.id}>`,
    embeds: [
      new EmbedBuilder()
        .setColor(embedColor('info'))
        .setTitle('🎫 Purchase Ticket')
        .setDescription(
          `Hi ${member}, welcome to your ticket!\n\n` +
          'Please select a product below to get started. A staff member will be with you shortly.'
        )
        .addFields(
          {
            name: '📌 How it works',
            value: '1. Pick a product\n2. Accept the terms\n3. Choose your payment method\n4. Send the payment\n5. Staff verifies and delivers',
            inline: false,
          }
        )
        .setFooter({ text: 'Use /close when finished | Staff can /adduser or /removeuser' }),
    ],
    components,
  });
  return channel;
}

async function handleBuy(interaction) {
  const existing = interaction.guild.channels.cache.find(
    (c) =>
      c.topic === `Ticket:${interaction.user.id}` &&
      c.parentId === CATEGORY_ID
  );
  if (existing) {
    return interaction.reply({
      content: `You already have an open ticket: ${existing}`,
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });
  const channel = await createTicket(interaction.member, interaction.guild);
  await interaction.editReply({ content: `Ticket created: ${channel}` });
}

async function handleClose(interaction) {
  if (!interaction.channel.topic?.startsWith('Ticket:')) {
    return interaction.reply({
      content: 'This is not a ticket channel.',
      ephemeral: true,
    });
  }

  const embed = new EmbedBuilder()
    .setColor(embedColor('warning'))
    .setTitle('🔒 Close Ticket')
    .setDescription('Are you sure you want to close this ticket? This action cannot be undone.');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_close')
      .setLabel('Yes, Close')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('cancel_close')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleAddUser(interaction) {
  if (!interaction.channel.topic?.startsWith('Ticket:')) {
    return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
  }

  const user = interaction.options.getUser('user');
  await interaction.channel.permissionOverwrites.create(user.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(embedColor('success'))
        .setDescription(`✅ Added ${user} to this ticket.`),
    ],
  });
}

async function handleRemoveUser(interaction) {
  if (!interaction.channel.topic?.startsWith('Ticket:')) {
    return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
  }

  const user = interaction.options.getUser('user');
  if (user.id === interaction.channel.topic.split(':')[1]) {
    return interaction.reply({ content: 'Cannot remove the ticket owner.', ephemeral: true });
  }

  await interaction.channel.permissionOverwrites.delete(user.id).catch(() => {});
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(embedColor('danger'))
        .setDescription(`✅ Removed ${user} from this ticket.`),
    ],
  });
}

async function handleRename(interaction) {
  if (!interaction.channel.topic?.startsWith('Ticket:')) {
    return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
  }

  const name = interaction.options.getString('name');
  await interaction.channel.setName(name);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(embedColor('success'))
        .setDescription(`✅ Renamed channel to **#${name}**.`),
    ],
  });
}

async function handleButton(interaction) {
  const { customId } = interaction;

  if (customId === 'buy_button') {
    await interaction.deferReply({ ephemeral: true });
    const channel = await createTicket(interaction.member, interaction.guild);
    await interaction.editReply({ content: `Ticket opened: ${channel}` });
    return;
  }

  if (customId === 'cancel') {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor('danger'))
          .setDescription('Ticket cancelled.'),
      ],
      components: [],
    });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    return;
  }

  if (customId === 'cancel_close') {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor('success'))
          .setDescription('Close cancelled.'),
      ],
      components: [],
    });
    return;
  }

  if (customId === 'confirm_close') {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor('warning'))
          .setDescription('🔒 Closing ticket...'),
      ],
      components: [],
    });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
    return;
  }

  if (customId === 'payment_sent') {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor('success'))
          .setDescription('✅ Staff has been notified. They will respond shortly.'),
      ],
      components: [],
    });

    const staffChan = interaction.guild.channels.cache.find(
      (c) => c.name === 'payment-logs' && c.type === ChannelType.GuildText
    );
    if (staffChan) {
      const pay = pendingPayments[interaction.channel.id] || {};
      staffChan.send({
        content: `<@&${STAFF_ROLE_ID}>`,
        embeds: [
          new EmbedBuilder()
            .setColor(embedColor('warning'))
            .setTitle('💳 Payment Pending')
            .addFields(
              { name: 'User', value: `${interaction.user}`, inline: true },
              { name: 'Channel', value: `${interaction.channel}`, inline: true },
              ...(pay.method ? [{ name: 'Method', value: pay.method, inline: true }] : []),
              ...(pay.amount ? [{ name: 'Amount', value: pay.amount, inline: true }] : [])
            )
            .setTimestamp(),
        ],
      });
    }
    return;
  }

  const selectMatch = customId.match(/^select_(.+)$/);
  if (selectMatch) {
    const product = config.products.find((p) => p.id === selectMatch[1]);
    if (!product) return;

    const priceText = Object.entries(product.prices)
      .map(([id, amount]) => {
        const method = config.paymentMethods.find((m) => m.id === id);
        return `• **${method ? method.label : id}** — ${amount}`;
      })
      .join('\n');

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor('warning'))
          .setTitle(`📦 Purchase: ${product.name}`)
          .setDescription(`${config.terms}\n\n**Prices**\n${priceText}\n\nClick **I Accept** to proceed.`),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`accept_${product.id}`)
            .setLabel('I Accept')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
        ),
      ],
    });
    return;
  }

  const acceptMatch = customId.match(/^accept_(.+)$/);
  if (acceptMatch) {
    const product = config.products.find((p) => p.id === acceptMatch[1]);
    if (!product) return;

    const methodRows = [];
    const buttons = config.paymentMethods.map((m) =>
      new ButtonBuilder()
        .setCustomId(`pay_${product.id}_${m.id}`)
        .setLabel(`${m.label} — ${product.prices[m.id] || '?'} ${m.currency}`)
        .setStyle(ButtonStyle.Secondary)
    );

    for (let i = 0; i < buttons.length; i += 3) {
      methodRows.push(
        new ActionRowBuilder().addComponents(buttons.slice(i, i + 3))
      );
    }
    methodRows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
      )
    );

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor('success'))
          .setTitle('💳 Choose Payment Method')
          .setDescription(`Select a payment method for **${product.name}**.`),
      ],
      components: methodRows,
    });
    return;
  }

  const payMatch = customId.match(/^pay_(.+)_(.+)$/);
  if (payMatch) {
    const product = config.products.find((p) => p.id === payMatch[1]);
    const method = config.paymentMethods.find((m) => m.id === payMatch[2]);
    if (!product || !method) return;

    const amount = product.prices[method.id];
    pendingPayments[interaction.channel.id] = {
      product: product.name,
      method: method.label,
      amount: `${amount} ${method.currency}`,
    };

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor('success'))
          .setTitle('💳 Payment Required')
          .setDescription(
            `**Product:** ${product.name}\n` +
            `**Method:** ${method.label}\n` +
            `**Amount:** ${amount} ${method.currency}\n` +
            `**Network:** ${method.network}\n\n` +
            'Send the exact amount to the wallet below:\n\n' +
            `\`\`\`${method.address}\`\`\`\n` +
            'After sending, click **Payment Sent** to notify staff.'
          ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('payment_sent')
            .setLabel('Payment Sent')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
        ),
      ],
    });
  }
}

function formatPrice(product) {
  const prices = Object.values(product.prices);
  if (!prices.length) return '?';
  const min = Math.min(...prices.map(Number));
  const method = config.paymentMethods.find(
    (m) => Number(product.prices[m.id]) === min
  );
  return method ? `${min} ${method.currency}` : `${prices[0]}`;
}

client.login(process.env.DISCORD_TOKEN);
