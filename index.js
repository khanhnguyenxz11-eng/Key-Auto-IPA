require("dotenv").config();
const fs = require("fs");
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} = require("discord.js");

const app = express();
app.use(express.json());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ===== FILES =====
const usersFile = "./users.json";
const keysFile = "./keys.json";
const transactionsFile = "./transactions.json";
const panelFile = "./panel.json";

// ===== LOAD DATA =====
let users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile)) : {};
let keys = fs.existsSync(keysFile) ? JSON.parse(fs.readFileSync(keysFile)) : { ngay: [], tuan: [], thang: [] };
let transactions = fs.existsSync(transactionsFile) ? JSON.parse(fs.readFileSync(transactionsFile)) : {};
let panelData = fs.existsSync(panelFile) ? JSON.parse(fs.readFileSync(panelFile)) : {};

function saveAll() {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2));
  fs.writeFileSync(transactionsFile, JSON.stringify(transactions, null, 2));
  fs.writeFileSync(panelFile, JSON.stringify(panelData, null, 2));
}

// ===== GIÁ =====
const prices = {
  ngay: 15000,
  tuan: 70000,
  thang: 120000
};

// ===== PANEL =====
function createPanelEmbed() {
  return new EmbedBuilder()
    .setTitle("🛒 PANEL MUA KEY")
    .setDescription(
`🗓 Key Ngày (15.000đ) - Còn: ${keys.ngay.length}
📅 Key Tuần (70.000đ) - Còn: ${keys.tuan.length}
🗓 Key Tháng (120.000đ) - Còn: ${keys.thang.length}`
    )
    .setColor("Blue")
    .setTimestamp();
}

function createPanelButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("nap").setLabel("💳 Nạp tiền").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("sodu").setLabel("💰 Số dư").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("mua").setLabel("🛒 Mua key").setStyle(ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("addkey").setLabel("➕ Add Key (Admin)").setStyle(ButtonStyle.Danger)
  );

  return [row1, row2];
}

// ===== UPDATE PANEL =====
async function updatePanel() {
  if (!panelData.messageId) return;

  const channel = await client.channels.fetch(process.env.CHANNEL_PANEL_ID);
  const message = await channel.messages.fetch(panelData.messageId);

  await message.edit({
    embeds: [createPanelEmbed()],
    components: createPanelButtons()
  });
}

// ===== READY =====
client.once("ready", async () => {
  console.log("Bot ready");

  const channel = await client.channels.fetch(process.env.CHANNEL_PANEL_ID);

  if (!panelData.messageId) {
    const msg = await channel.send({
      embeds: [createPanelEmbed()],
      components: createPanelButtons()
    });

    panelData.messageId = msg.id;
    saveAll();
  } else {
    updatePanel();
  }
});

// ===== INTERACTION =====
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  const userId = interaction.user.id;

  // ===== SỐ DƯ =====
  if (interaction.customId === "sodu") {
    return interaction.reply({
      content: `💰 Số dư: ${(users[userId] || 0).toLocaleString()} VND`,
      ephemeral: true
    });
  }

  // ===== MUA =====
  if (interaction.customId === "mua") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("buy_ngay").setLabel("🗓 Ngày").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("buy_tuan").setLabel("📅 Tuần").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("buy_thang").setLabel("🗓 Tháng").setStyle(ButtonStyle.Primary)
    );
    return interaction.reply({ content: "Chọn loại:", components: [row], ephemeral: true });
  }

  // ===== MUA KEY =====
  if (interaction.customId.startsWith("buy_")) {
    const type = interaction.customId.replace("buy_", "");

    if (!keys[type].length)
      return interaction.reply({ content: "❌ Hết key!", ephemeral: true });

    if ((users[userId] || 0) < prices[type])
      return interaction.reply({ content: "❌ Không đủ tiền!", ephemeral: true });

    users[userId] -= prices[type];
    const key = keys[type].shift();
    saveAll();

    await updatePanel();

    return interaction.reply({
      content: `🎉 Mua thành công!\n🔑 Key của bạn:\n\`${key}\``,
      ephemeral: true
    });
  }

  // ===== ADD KEY =====
  if (interaction.customId === "addkey") {
    if (interaction.user.id !== process.env.ADMIN_ID)
      return interaction.reply({ content: "❌ Không có quyền", ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("add_ngay").setLabel("🗓 Ngày").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("add_tuan").setLabel("📅 Tuần").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("add_thang").setLabel("🗓 Tháng").setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ content: "Chọn loại:", components: [row], ephemeral: true });
  }

  if (interaction.customId.startsWith("add_")) {
    const type = interaction.customId.replace("add_", "");

    const modal = new ModalBuilder()
      .setCustomId(`addmodal_${type}`)
      .setTitle("Thêm key");

    const input = new TextInputBuilder()
      .setCustomId("keys")
      .setLabel("Mỗi key 1 dòng")
      .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("addmodal_")) {
    const type = interaction.customId.replace("addmodal_", "");
    const list = interaction.fields.getTextInputValue("keys")
      .split("\n")
      .map(k => k.trim())
      .filter(k => k);

    keys[type].push(...list);
    saveAll();

    await updatePanel();

    return interaction.reply({
      content: `✅ Đã thêm ${list.length} key`,
      ephemeral: true
    });
  }
});

// ===== WEBHOOK NẠP TIỀN =====
app.post("/webhook", (req, res) => {
  const { content, amount, transaction_id } = req.body;

  if (!content || !content.startsWith("nap_")) return res.sendStatus(200);
  if (transactions[transaction_id]) return res.sendStatus(200);

  const userId = content.split("_")[1];

  transactions[transaction_id] = true;
  users[userId] = (users[userId] || 0) + parseInt(amount);
  saveAll();

  const channel = client.channels.cache.get(process.env.CHANNEL_NOTIFY_ID);

  const embed = new EmbedBuilder()
    .setTitle("🎉 Nạp thành công")
    .setDescription(`<@${userId}> +${parseInt(amount).toLocaleString()} VND`)
    .setColor("Green");

  channel.send({ content: `<@${userId}>`, embeds: [embed] });

  res.sendStatus(200);
});

app.listen(process.env.PORT);
client.login(process.env.DISCORD_TOKEN);
