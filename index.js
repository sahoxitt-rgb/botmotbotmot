require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    Partials,
    PermissionFlagsBits,
    ChannelType,
    PermissionsBitField,
    ActivityType
} = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// =============================================================================
// YEREL VERİTABANI (FİREBASE SİLİNDİ - %100 LOCAL)
// =============================================================================
const DB_FILE = path.join(__dirname, 'database.json');

function readDB() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = { 
            keys: {}, 
            settings: { aiChannel: null }, 
            blacklist: {}, 
            tickets: 0, 
            spins: {}, 
            welcomes: {} 
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 4));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 4));
}

// =============================================================================
// AYARLAR VE KONFİGÜRASYON
// =============================================================================
const apiKey = process.env.GEMINI_API_KEY || "BOS";
const genAI = new GoogleGenerativeAI(apiKey);

const CONFIG = {
    OWNER_ID: "1380526273431994449",
    MASTER_VIEW_ID: "1380526273431994449",
    SUPPORT_ROLE_ID: "1380526273431994449",
    LOG_CHANNEL_ID: "1469080536659001568", 
    ARCHIVE_CHANNEL_ID: "1469080536659001568", 
    VOICE_GUILD_ID: "1446824586808262709",
    VOICE_CHANNEL_ID: "1465453822204969154",
    WELCOME_CHANNEL_ID: "1469080536659001568",

    EMBED_COLOR: '#2B2D31',
    SUCCESS_COLOR: '#57F287',
    ERROR_COLOR: '#ED4245',
    INFO_COLOR: '#5865F2',
    GOLD_COLOR: '#F1C40F',

    DEPREM_API_URL: 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live', // En hızlı API
    DEPREM_CHECK_INTERVAL: 15000, // 15 Saniyede bir tarar
    DEPREM_MIN_MAGNITUDE: 3.0,
    
    WELCOME_SETTINGS: { 
        showUsername: true, showAvatar: true, showJoinDate: true, showAccountCreate: true, showMemberCount: true
    }
};

let isMaintenanceEnabled = false;
let loaderStatus = "UNDETECTED 🟢";
let lastEarthquakeTime = 0; 

// =============================================================================
// 1. WEB SERVER & DASHBOARD
// =============================================================================
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.send({ status: 'Online', system: 'SAHO CHEATS SYSTEM vFinal + Deprem PRO/PLUS', time: new Date().toISOString() });
});

app.get('/api/stats', (req, res) => {
    let memberCount = 0;
    const guild = client.guilds.cache.get(CONFIG.VOICE_GUILD_ID);
    if (guild) memberCount = guild.memberCount;
    res.json({
        status: client.isReady() ? 'Online 🟢' : 'Offline 🔴',
        ping: client.ws.ping || 0,
        memberCount: memberCount,
        loaderStatus: loaderStatus,
        maintenance: isMaintenanceEnabled ? 'Aktif 🔒' : 'Kapalı 🔓',
        uptime: client.uptime || 0
    });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`🌍 [SERVER] Web sunucusu ${port} portunda başlatıldı.`));

// =============================================================================
// 2. BOT İSTEMCİSİ
// =============================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

// =============================================================================
// 3. KOMUT LİSTESİ
// =============================================================================
const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Botun ve API\'nin anlık gecikme süresini gösterir.'),
    new SlashCommandBuilder().setName('guncelle').setDescription('🔄 (Admin) Botu yeniden başlatır.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // ------------------- DEPREM PRO/PLUS SİSTEMİ -------------------
    new SlashCommandBuilder().setName('prokeyolustur')
        .setDescription('🔑 (Admin) Deprem Erken Uyarı Keyi oluşturur.')
        .addIntegerOption(o => o.setName('gun').setDescription('Süre (Gün)').setRequired(true))
        .addStringOption(o => o.setName('tip').setDescription('Lisans Tipi').setRequired(true)
            .addChoices({name:'PRO (Anında Bildirim)', value:'pro'}, {name:'PLUS (30sn Gecikmeli)', value:'plus'}))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder().setName('sil')
        .setDescription('🗑️ (Admin) Keyi kalıcı olarak siler.')
        .addStringOption(o => o.setName('key_id').setDescription('Key ID (Örn: #K-1024)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('durdur')
        .setDescription('⏸️ (Admin) Keyin veri akışını dondurur veya açar.')
        .addStringOption(o => o.setName('key_id').setDescription('Key ID (Örn: #K-1024)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('hwidsifirla')
        .setDescription('🔄 (Admin) Keyin kanal/sunucu bağını koparır.')
        .addStringOption(o => o.setName('key_id').setDescription('Key ID (Örn: #K-1024)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('tum-lisanslar')
        .setDescription('📜 (Admin) Aktif tüm deprem lisanslarını listeler.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('depremprokur')
        .setDescription('🚨 Deprem PRO Erken Uyarı sistemini kanala kurar.')
        .addChannelOption(o => o.setName('kanal').setDescription('Uyarıların geleceği kanal').setRequired(true))
        .addStringOption(o => o.setName('key').setDescription('Satın aldığınız PRO Key').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder().setName('deprempluskur')
        .setDescription('🟠 Deprem PLUS Erken Uyarı sistemini kanala kurar.')
        .addChannelOption(o => o.setName('kanal').setDescription('Uyarıların geleceği kanal').setRequired(true))
        .addStringOption(o => o.setName('key').setDescription('Satın aldığınız PLUS Key').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // ------------------- TICKET, AI VE YÖNETİM -------------------
    new SlashCommandBuilder().setName('ticket-kur').setDescription('🎫 (Admin) Profesyonel Ticket Panelini Kurar.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ai-kur').setDescription('🤖 (Admin) Troll Yapay Zeka kanalını belirler.').addChannelOption(o => o.setName('kanal').setDescription('AI Kanalı').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('welcomer-kur').setDescription('👋 (Admin) Hoş geldin sistemini kurar.').addChannelOption(o => o.setName('kanal').setDescription('Kanal').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('welcomer-dashboard').setDescription('⚙️ (Admin) Hoş geldin ayarlarını yönetir.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('nuke').setDescription('☢️ (Admin) Kanalı siler ve aynı özelliklerle yeniden oluşturur.').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('temizle').setDescription('🧹 (Admin) Sohbeti temizler.').addIntegerOption(o => o.setName('sayi').setDescription('Miktar (1-100)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder().setName('bakim-modu').setDescription('🔒 (Admin) Bakım modunu yönetir.').addBooleanOption(o => o.setName('durum').setDescription('Açık mı?').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    // ------------------- ÇARKIFELEK -------------------
    new SlashCommandBuilder().setName('cevir').setDescription('🎡 Şans Çarkı! (Ödül kazanma şansı).'),
    new SlashCommandBuilder().setName('cark-oranlar').setDescription('📊 Çarkıfelekteki ödüllerin oranlarını gösterir.'),
    new SlashCommandBuilder().setName('cark-hak-ekle').setDescription('🎡 (Admin) Kullanıcıya çark hakkı verir.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true))
        .addIntegerOption(o => o.setName('adet').setDescription('Adet').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

// =============================================================================
// 4. YARDIMCI FONKSİYONLAR
// =============================================================================
function generateKeyId() {
    return '#K-' + Math.floor(1000 + Math.random() * 9000);
}

function generateKeyString(type) {
    return `${type.toUpperCase()}-` + Math.random().toString(36).substring(2, 10).toUpperCase();
}

async function sendLog(guild, content) {
    if (!guild || !CONFIG.LOG_CHANNEL_ID) return;
    const channel = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (channel) {
        if (typeof content === 'string') channel.send({ content }).catch(() => {});
        else channel.send(content).catch(() => {});
    }
}

async function getNextTicketNumber() {
    const db = readDB();
    db.tickets += 1;
    writeDB(db);
    return db.tickets;
}

// ------------------- DEPREM MERKEZİ MOTORU -------------------
async function checkEarthquakes() {
    try {
        const response = await axios.get(CONFIG.DEPREM_API_URL);
        const data = response.data;
        if (!data.status) return;

        const earthquakes = data.result.slice(0, 5); // Son 5 depremi çek
        const newQuakes = earthquakes.filter(eq => eq.mag >= CONFIG.DEPREM_MIN_MAGNITUDE && new Date(eq.date).getTime() > lastEarthquakeTime);
        
        if (newQuakes.length > 0) {
            lastEarthquakeTime = Math.max(...newQuakes.map(eq => new Date(eq.date).getTime()));
            const db = readDB();

            for (const eq of newQuakes) {
                // Kayıtlı tüm keyleri tara
                for (const [keyId, info] of Object.entries(db.keys)) {
                    if (info.status !== 'active' || !info.boundChannel) continue;
                    
                    // Süre kontrolü
                    if (Date.now() > info.expiresAt) {
                        info.status = 'expired';
                        writeDB(db);
                        continue;
                    }

                    const channel = client.channels.cache.get(info.boundChannel);
                    if (!channel) continue;

                    const embed = new EmbedBuilder()
                        .setTitle(`🚨 DEPREM ERKEN UYARI AĞI`)
                        .setColor(eq.mag >= 4.0 ? CONFIG.ERROR_COLOR : CONFIG.GOLD_COLOR)
                        .addFields(
                            { name: '📍 Merkez Üssü', value: eq.title, inline: false },
                            { name: '📊 Büyüklük', value: `**${eq.mag.toFixed(1)}**`, inline: true },
                            { name: '📏 Derinlik', value: `${eq.depth} km`, inline: true },
                            { name: '🕒 Saat', value: eq.date, inline: true }
                        )
                        .setTimestamp();

                    if (info.type === 'pro') {
                        embed.setDescription('🔴 **[PRO SENSÖR]** - Deprem dalgaları merkeze ulaşmadan ~50 saniye önce iletildi.');
                        embed.setFooter({ text: 'SAHO QUAKE PRO | VİP AĞI' });
                        channel.send({ content: '@everyone 🚨 ŞİDDETLİ SARSINTI UYARISI!', embeds: [embed] }).catch(()=>{});
                    } else if (info.type === 'plus') {
                        embed.setDescription('🟠 **[PLUS SENSÖR]** - Deprem dalgaları ~20 saniye önce iletildi.');
                        embed.setFooter({ text: 'SAHO QUAKE PLUS' });
                        // PLUS lisanslara bilerek 30 saniye gecikmeli yolluyoruz
                        setTimeout(() => {
                            channel.send({ embeds: [embed] }).catch(()=>{});
                        }, 30000); 
                    }
                }
            }
        }
    } catch (error) {
        console.error('Deprem kontrol hatası:', error.message);
    }
}

// =============================================================================
// 5. BOT EVENTS
// =============================================================================
client.once('ready', async () => {
    console.log(`\n=============================================`);
    console.log(`✅ BOT GİRİŞ YAPTI: ${client.user.tag}`);
    console.log(`🚨 DEPREM PRO SİSTEMİ BAŞLATILDI`);
    console.log(`🤖 LOCAL DB & YAPAY ZEKA AKTİF`);
    console.log(`=============================================\n`);
 
    connectToVoice();

    let index = 0;
    setInterval(() => {
        let totalVoice = 0;
        client.guilds.cache.forEach(g => totalVoice += g.voiceStates.cache.size);
        const activities = [ `SAHO CHEATS`, `🔊 ${totalVoice} Kişi Seste`, `🚨 Deprem İzliyor`, `🤖 Troll AI Aktif` ];
        client.user.setActivity({ name: activities[index], type: ActivityType.Playing });
        index = (index + 1) % activities.length;
    }, 5000);

    setInterval(checkEarthquakes, CONFIG.DEPREM_CHECK_INTERVAL);
    checkEarthquakes(); 

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) {}
});

async function connectToVoice() {
    const guild = client.guilds.cache.get(CONFIG.VOICE_GUILD_ID);
    const channel = guild?.channels.cache.get(CONFIG.VOICE_CHANNEL_ID);
    if (!channel) return;
    try {
        const connection = joinVoiceChannel({
            channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: true
        });
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try { await Promise.race([ entersState(connection, VoiceConnectionStatus.Signalling, 5_000), entersState(connection, VoiceConnectionStatus.Connecting, 5_000) ]); } 
            catch { connection.destroy(); connectToVoice(); }
        });
    } catch (e) { setTimeout(connectToVoice, 5000); }
}

client.on('guildMemberAdd', async member => {
    const channel = member.guild.channels.cache.get(CONFIG.WELCOME_CHANNEL_ID);
    if (!channel) return;
    const db = readDB();
    const settings = db.welcomes[member.guild.id] || CONFIG.WELCOME_SETTINGS;
    
    const embed = new EmbedBuilder()
        .setTitle('🚀 SAHO CHEATS AİLESİNE HOŞ GELDİN!')
        .setColor(CONFIG.EMBED_COLOR)
        .setThumbnail(settings.showAvatar ? member.user.displayAvatarURL({ dynamic: true }) : null)
        .addFields(
            settings.showUsername ? { name: 'Kullanıcı', value: member.user.tag, inline: true } : null,
            settings.showAccountCreate ? { name: 'Hesap Oluşturma', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true } : null,
            settings.showJoinDate ? { name: 'Katılım', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true } : null,
            settings.showMemberCount ? { name: 'Üye Sırası', value: `${member.guild.memberCount}. üye`, inline: true } : null
        ).setFooter({ text: 'SAHO CHEATS Community' });
    channel.send({ content: `${member.user}`, embeds: [embed] });
});

// =============================================================================
// OTO MODERASYON, OTO CEVAP VE TROLL YAPAY ZEKA (AI)
// =============================================================================
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const db = readDB();

    // 1. OTO MODERASYON
    if (!message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
        if (/(https?:\/\/[^\s]+|discord\.gg\/[a-zA-Z0-9]+)/gi.test(message.content.toLowerCase())) {
            await message.delete().catch(() => {});
            return message.channel.send(`⛔ **${message.author}**, bu sunucuda link veya reklam paylaşmak yasak koçum!`);
        }
    }

    // 2. TROLL AI SOHBET
    try {
        if (db.settings.aiChannel && message.channel.id === db.settings.aiChannel) {
            if (!message.content || message.content.trim() === "") return;
            if (message.content.toLowerCase().includes("oç")) return message.reply("sensin oç aynaya bak da konuş qweqweqwe 😂");

            await message.channel.sendTyping();
            const model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash-latest", 
                systemInstruction: "Sen Discord'da takılan, sarkastik, troll ve kafa dengi bir botsun. İnsanlara 'kanka', 'birader' diye hitap et. Kısa ve net cevaplar ver."
            });
            const result = await model.generateContent(message.content.toString());
            return message.reply(result.response.text());
        }
    } catch (error) {
        return message.reply(`⚠️ **Kanka bir hata oldu!** Detay: \`${error.message}\``);
    }
});

// =============================================================================
// 6. ETKİLEŞİM YÖNETİCİSİ (ZIRHLI TRY-CATCH)
// =============================================================================
client.on('interactionCreate', async interaction => {
    const db = readDB();
    if (db.blacklist[interaction.user.id]) return interaction.reply({ content: '⛔ **ENGELLENDİNİZ.**', ephemeral: true });

    try {
        if (interaction.isStringSelectMenu()) return await handleSelectMenu(interaction, db);
        if (interaction.isButton()) return await handleButton(interaction, db);
        if (interaction.isChatInputCommand()) return await handleCommand(interaction, db);
    } catch (e) { console.error('Etkileşim Hatası:', e.message); }
});

// =============================================================================
// 7. SLASH KOMUT HANDLER
// =============================================================================
async function handleCommand(interaction, db) {
    const { commandName, options, user, guild } = interaction;
    
    if (commandName === 'ping') {
        return interaction.reply({ content: `🏓 **Pong!** Bot Gecikmesi: \`${client.ws.ping}ms\``, ephemeral: true });
    }

    if (commandName === 'guncelle') {
        await interaction.reply({ content: '🔄 **Sistem güncelleniyor, bot yeniden başlatılıyor...**', ephemeral: true });
        setTimeout(() => { process.exit(1); }, 2000);
        return;
    }

    if (commandName === 'ai-kur') {
        const kanal = options.getChannel('kanal');
        db.settings.aiChannel = kanal.id;
        writeDB(db);
        return interaction.reply({ content: `✅ AI Sohbet kanalı ${kanal} olarak ayarlandı.`, ephemeral: true });
    }

    if (commandName === 'welcomer-dashboard') {
        const settings = db.welcomes[guild.id] || CONFIG.WELCOME_SETTINGS;
        const embed = new EmbedBuilder().setTitle('⚙️ Welcomer Ayarları').setColor(CONFIG.INFO_COLOR);
        const menu = new StringSelectMenuBuilder().setCustomId('welcomer_toggle').setPlaceholder('Ayar Seç...').addOptions(
            { label: 'Kullanıcı Adı Göster', value: 'showUsername', description: settings.showUsername ? 'Açık' : 'Kapalı' },
            { label: 'Avatar Göster', value: 'showAvatar', description: settings.showAvatar ? 'Açık' : 'Kapalı' },
            { label: 'Üye Sırası Göster', value: 'showMemberCount', description: settings.showMemberCount ? 'Açık' : 'Kapalı' }
        );
        return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
    }

    // ------------------- DEPREM PRO/PLUS KOMUTLARI -------------------
    if (commandName === 'prokeyolustur') {
        const gun = options.getInteger('gun');
        const tip = options.getString('tip'); // pro veya plus
        const keyId = generateKeyId();
        const keyString = generateKeyString(tip);

        db.keys[keyId] = {
            key: keyString,
            type: tip,
            days: gun,
            status: 'unused', // unused, active, paused, expired
            boundServer: null,
            boundChannel: null,
            expiresAt: null
        };
        writeDB(db);

        const embed = new EmbedBuilder()
            .setTitle(`🔑 YENİ ${tip.toUpperCase()} KEY OLUŞTURULDU`)
            .addFields(
                { name: 'Key ID (Yönetim İçin)', value: `\`${keyId}\``, inline: true },
                { name: 'Lisans Tipi', value: tip.toUpperCase(), inline: true },
                { name: 'Süre', value: `${gun} Gün`, inline: true },
                { name: 'Satış Anahtarı (KEY)', value: `\`${keyString}\``, inline: false }
            )
            .setColor(CONFIG.SUCCESS_COLOR);
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'sil') {
        const keyId = options.getString('key_id');
        if (!db.keys[keyId]) return interaction.reply({ content: '❌ Bu ID\'ye ait key bulunamadı.', ephemeral: true });
        delete db.keys[keyId];
        writeDB(db);
        return interaction.reply({ content: `🗑️ **${keyId}** sistemden tamamen silindi.`, ephemeral: true });
    }

    if (commandName === 'durdur') {
        const keyId = options.getString('key_id');
        if (!db.keys[keyId]) return interaction.reply({ content: '❌ Bulunamadı.', ephemeral: true });
        if (db.keys[keyId].status === 'unused') return interaction.reply({ content: '❌ Bu key henüz kullanılmamış.', ephemeral: true });
        
        db.keys[keyId].status = db.keys[keyId].status === 'active' ? 'paused' : 'active';
        writeDB(db);
        return interaction.reply({ content: `⏸️ Key durumu güncellendi: **${db.keys[keyId].status}**`, ephemeral: true });
    }

    if (commandName === 'hwidsifirla') {
        const keyId = options.getString('key_id');
        if (!db.keys[keyId]) return interaction.reply({ content: '❌ Bulunamadı.', ephemeral: true });
        
        db.keys[keyId].boundServer = null;
        db.keys[keyId].boundChannel = null;
        db.keys[keyId].status = 'unused'; // Tekrar kurulabilir hale gelir (süresi sıfırlanmaz)
        writeDB(db);
        return interaction.reply({ content: `🔄 **${keyId}** ID'li keyin HWID (Kanal) bağı koparıldı. Başka sunucuda tekrar kurulabilir.`, ephemeral: true });
    }

    if (commandName === 'tum-lisanslar') {
        let text = "**📜 AKTİF DEPREM LİSANSLARI**\n\n";
        let count = 0;
        for (const [keyId, data] of Object.entries(db.keys)) {
            text += `ID: \`${keyId}\` | Tip: **${data.type.toUpperCase()}** | Durum: ${data.status} | Bitiş: <t:${Math.floor(data.expiresAt/1000) || 0}:d>\n`;
            count++;
        }
        if(count === 0) text += "Sistemde oluşturulmuş key bulunmuyor.";
        return interaction.reply({ content: text, ephemeral: true });
    }

    if (commandName === 'depremprokur' || commandName === 'deprempluskur') {
        const kanal = options.getChannel('kanal');
        const girilenKey = options.getString('key');
        const requiredType = commandName === 'depremprokur' ? 'pro' : 'plus';

        // Key'i bul
        let foundKeyId = null;
        for (const [kId, data] of Object.entries(db.keys)) {
            if (data.key === girilenKey) { foundKeyId = kId; break; }
        }

        if (!foundKeyId) return interaction.reply({ content: '❌ Geçersiz Lisans Anahtarı.', ephemeral: true });
        const keyData = db.keys[foundKeyId];

        if (keyData.type !== requiredType) return interaction.reply({ content: `❌ Bu key bir **${keyData.type.toUpperCase()}** keyidir. Lütfen doğru komutu kullanın.`, ephemeral: true });
        if (keyData.status !== 'unused') return interaction.reply({ content: '❌ Bu key zaten kullanılmış veya pasif duruma alınmış.', ephemeral: true });

        // Kurulumu Tamamla
        keyData.status = 'active';
        keyData.boundServer = guild.id;
        keyData.boundChannel = kanal.id;
        keyData.expiresAt = Date.now() + (keyData.days * 24 * 60 * 60 * 1000);
        writeDB(db);

        const embed = new EmbedBuilder()
            .setTitle(`✅ ${requiredType.toUpperCase()} SİSTEMİ AKTİF EDİLDİ`)
            .setDescription(`Erken uyarı sistemi başarıyla ${kanal} kanalına bağlandı.\n\n**Lisans Bitiş Tarihi:** <t:${Math.floor(keyData.expiresAt / 1000)}:R>`)
            .setColor(requiredType === 'pro' ? CONFIG.ERROR_COLOR : CONFIG.GOLD_COLOR);

        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'ticket-kur') {
        const embed = new EmbedBuilder()
            .setTitle('🔥 SAHO CHEATS | DESTEK MERKEZİ')
            .setDescription('Aşağıdaki menüden kategorinizi seçin.')
            .setColor(CONFIG.GOLD_COLOR);
        const menu = new StringSelectMenuBuilder()
            .setCustomId('ticket_create_menu')
            .setPlaceholder('📩 Kategori Seçin...')
            .addOptions({ label: 'Genel Destek', value: 'cat_tech', emoji: '🛠️' });
        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
        return interaction.reply({ content: '✅ Ticket paneli kuruldu!', ephemeral: true });
    }
    
    // Çarkıfelek 
    if (commandName === 'cevir') {
        await interaction.deferReply();
        let rights = db.spins[user.id]?.rights || 0;
        let lastSpin = db.spins[user.id]?.lastSpin || 0;
        const cooldown = 24 * 60 * 60 * 1000;

        if (rights > 0) {
            db.spins[user.id].rights -= 1;
        } else {
            if (Date.now() - lastSpin < cooldown) return interaction.editReply(`⏳ **Günlük hakkın doldu!** <t:${Math.floor((lastSpin + cooldown) / 1000)}:R> tekrar dene.`);
            if (!db.spins[user.id]) db.spins[user.id] = { rights: 0 };
            db.spins[user.id].lastSpin = Date.now();
        }
        writeDB(db);
        
        const items = [ { name: "VIP ROLÜ 💎", chance: 5 }, { name: "PAS (Tekrar Dene) ❌", chance: 95 } ];
        let random = Math.random() * 100;
        let won = random <= 5;

        const embed = new EmbedBuilder()
            .setTitle('🎡 ÇARKIFELEK')
            .setDescription(won ? `🎉 **TEBRİKLER!**\nKazandığın: VIP ROLÜ` : `📉 **Maalesef...**\nSonuç: PAS`)
            .setColor(won ? 'Gold' : 'Red');
        return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'cark-hak-ekle') {
        const target = options.getUser('kullanici');
        const adet = options.getInteger('adet');
        if (!db.spins[target.id]) db.spins[target.id] = { rights: 0, lastSpin: 0 };
        db.spins[target.id].rights += adet;
        writeDB(db);
        return interaction.reply({ content: `✅ **${target.tag}** kullanıcısına **+${adet}** hak eklendi.`, ephemeral: true });
    }
}

// =============================================================================
// 8. BUTON & MENÜ HANDLER
// =============================================================================
async function handleSelectMenu(interaction, db) {
    if (interaction.customId === 'welcomer_toggle') {
        const settingKey = interaction.values[0];
        if (!db.welcomes[interaction.guild.id]) db.welcomes[interaction.guild.id] = CONFIG.WELCOME_SETTINGS;
        db.welcomes[interaction.guild.id][settingKey] = !db.welcomes[interaction.guild.id][settingKey];
        writeDB(db);
        return interaction.reply({ content: `✅ Ayar güncellendi!`, ephemeral: true });
    }

    if (interaction.customId === 'ticket_create_menu') {
        if (isMaintenanceEnabled) return interaction.reply({ content: '🔒 Bakımdayız.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const ticketNum = await getNextTicketNumber();
        const ticketChannel = await interaction.guild.channels.create({
            name: `destek-${ticketNum}`, type: ChannelType.GuildText, parent: interaction.channel.parentId,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });
        
        const controlRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Kapat & Arşivle').setStyle(ButtonStyle.Danger));
        await ticketChannel.send({ content: `${interaction.user} Hoş geldin!`, components: [controlRow] });
        return interaction.editReply(`✅ Ticket açıldı: ${ticketChannel}`);
    }
}

async function handleButton(interaction, db) {
    if (interaction.customId === 'close_ticket') {
        await interaction.reply({ content: '🔒 **Ticket kapatılıyor...**', ephemeral: true });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    }
}

// =============================================================================
// 10. CRASH ENGELLEYİCİ - ZIRH SİSTEMİ
// =============================================================================
process.on('unhandledRejection', error => console.error('⚠️ [CRASH ÖNLENDİ]:', error.message));
process.on('uncaughtException', error => console.error('🚨 [CRASH ÖNLENDİ]:', error.message));

client.login(process.env.TOKEN);