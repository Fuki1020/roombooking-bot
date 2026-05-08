import {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    Events,
    StringSelectMenuBuilder
} from "discord.js";

import dotenv from "dotenv";
import express from "express";

dotenv.config();

const TOKEN = process.env.TOKEN;

// ==============================
// Discord Client
// ==============================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// 一時データ保存
client.tempData = {};


// ==============================
// Render用 Web Server
// ==============================
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot is running!");
});

app.listen(PORT, () => {
    console.log(`Web server running on port ${PORT}`);
});


// ==============================
// 起動時
// ==============================
client.once(Events.ClientReady, async () => {
    try {

        console.log(`ログインしました: ${client.user.tag}`);

        const guilds = client.guilds.cache;
        let channel = null;

        for (const guild of guilds.values()) {

            const channels = await guild.channels.fetch();

            channel = channels.find(
                ch => ch?.name === "🏫｜教室利用"
            );

            if (channel) break;
        }

        if (!channel) {
            console.log("🏫｜教室利用 が見つかりません");
            return;
        }

        const button = new ButtonBuilder()
            .setCustomId("open_form")
            .setLabel("申請する")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🏫");

        const row =
            new ActionRowBuilder().addComponents(button);

        const messages =
            await channel.messages.fetch({ limit: 10 });

        const exists = messages.some(msg =>
            msg.author.id === client.user.id &&
            msg.content.includes("🏫 教室利用申請")
        );

        if (!exists) {
            await channel.send({
                content:
                    "🏫 教室利用申請\nボタンから申請してください。",
                components: [row]
            });
        }

    } catch (err) {
        console.error(err);
    }
});


// ==============================
// Interaction
// ==============================
client.on(Events.InteractionCreate, async interaction => {

    try {

        // --------------------------
        // ボタン押下
        // --------------------------
        if (interaction.isButton()) {

            if (interaction.customId === "open_form") {

                const modal = new ModalBuilder()
                    .setCustomId("reservation_modal")
                    .setTitle("🏫｜教室予約");

                const roomInput =
                    new TextInputBuilder()
                        .setCustomId("room")
                        .setLabel("利用教室")
                        .setPlaceholder("例: 工学系講義棟111講義室")
                        .setStyle(TextInputStyle.Short);

                const dateInput =
                    new TextInputBuilder()
                        .setCustomId("date")
                        .setLabel("利用日（複数可）")
                        .setPlaceholder("例: 2026/05/09,2026/05/10")
                        .setStyle(TextInputStyle.Short);

                const purposeInput =
                    new TextInputBuilder()
                        .setCustomId("purpose")
                        .setLabel("利用目的")
                        .setPlaceholder("例: NHK学生ロボコンに向けた機体製作")
                        .setStyle(TextInputStyle.Short);

                const peopleInput =
                    new TextInputBuilder()
                        .setCustomId("people")
                        .setLabel("利用人数")
                        .setPlaceholder("例: 5")
                        .setStyle(TextInputStyle.Short);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(roomInput),
                    new ActionRowBuilder().addComponents(dateInput),
                    new ActionRowBuilder().addComponents(purposeInput),
                    new ActionRowBuilder().addComponents(peopleInput)
                );

                await interaction.showModal(modal);
            }
        }


        // --------------------------
        // モーダル送信
        // --------------------------
        if (interaction.isModalSubmit()) {

            if (interaction.customId === "reservation_modal") {

                const room =
                    interaction.fields.getTextInputValue("room");

                const date =
                    interaction.fields.getTextInputValue("date");

                const purpose =
                    interaction.fields.getTextInputValue("purpose");

                const people =
                    interaction.fields.getTextInputValue("people");

                const startSelect =
                    new StringSelectMenuBuilder()
                        .setCustomId("start_time")
                        .setPlaceholder("開始時間を選択")
                        .addOptions(
                            Array.from({ length: 14 }, (_, i) => ({
                                label: `${i + 8}:00`,
                                value: `${String(i + 8).padStart(2, "0")}:00`
                            }))
                        );

                await interaction.reply({
                    content: "開始時間を選択してください。",
                    components: [
                        new ActionRowBuilder()
                            .addComponents(startSelect)
                    ],
                    ephemeral: true
                });

                client.tempData[interaction.user.id] = {
                    room,
                    date,
                    purpose,
                    people
                };
            }
        }


        // --------------------------
        // 開始時間選択
        // --------------------------
        if (
            interaction.isStringSelectMenu() &&
            interaction.customId === "start_time"
        ) {

            client.tempData[interaction.user.id].start =
                interaction.values[0];

            const endSelect =
                new StringSelectMenuBuilder()
                    .setCustomId("end_time")
                    .setPlaceholder("終了時間を選択")
                    .addOptions(
                        Array.from({ length: 14 }, (_, i) => ({
                            label: `${i + 9}:00`,
                            value: `${String(i + 9).padStart(2, "0")}:00`
                        }))
                    );

            await interaction.update({
                content: "終了時間を選択してください。",
                components: [
                    new ActionRowBuilder()
                        .addComponents(endSelect)
                ]
            });
        }


        // --------------------------
        // 終了時間選択
        // --------------------------
        if (
            interaction.isStringSelectMenu() &&
            interaction.customId === "end_time"
        ) {

            const data =
                client.tempData[interaction.user.id];

            const end =
                interaction.values[0];

            // 終了時間チェック
            if (end <= data.start) {
                await interaction.update({
                    content:
                        "終了時間は開始時間より後にしてください。",
                    components: []
                });

                delete client.tempData[interaction.user.id];
                return;
            }

            const channels =
                await interaction.guild.channels.fetch();

            const channel =
                channels.find(
                    ch => ch?.name === "🗓️｜利用予定"
                );

            if (!channel) {
                await interaction.update({
                    content:
                        "送信先チャンネルが見つかりません。",
                    components: []
                });
                return;
            }

            const dates =
                data.date.split(",");

            let message =
                "🏫｜教室利用申請\n\n" +
                `${data.room}\n`;

            for (let d of dates) {

                d = d.trim();

                const dt = new Date(d);

                const formattedDate =
                    `${dt.getMonth() + 1}月${dt.getDate()}日`;

                message +=
                    `${formattedDate}  ${data.start}〜${end}\n` +
                    `${data.purpose}\n` +
                    `${data.people}人\n\n`;
            }

            message +=
                `【申請者】<@${interaction.user.id}>`;

            await channel.send({
                content: message
            });

            delete client.tempData[interaction.user.id];

            await interaction.update({
                content: "申請完了しました！",
                components: []
            });
        }

    } catch (err) {
        console.error(err);
    }
});

client.login(TOKEN);