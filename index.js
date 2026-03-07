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
const { GoogleGenerativeAI } = require("@google/generative-ai");

// =============================================================================
// AYARLAR VE KONFİGÜRASYON
// =============================================================================
// Eğer API key yoksa botun komple çökmemesi için ufak bir kontrol ekledik
const apiKey = process.env.GEMINI_API_KEY || "BOS";
const genAI = new GoogleGenerativeAI(apiKey);

const CONFIG = {
    // ------------------- VERİTABANI BAĞLANTISI -------------------
    FIREBASE_URL: process.env.FIREBASE_URL,
    FIREBASE_SECRET: process.env.FIREBASE_SECRET,
 
    // -------  ------------ YETKİLENDİRME -------------------
    OWNER_ID: "1380526273431994449",
    MASTER_VIEW_ID: "1380526273431994449",
    SUPPORT_ROLE_ID: "1380526273431994449",
    // ------------------- KANALLAR VE ROLLER -------------------
    LOG_CHANNEL_ID: "BURAYA_LOG_KANAL_ID_YAZ",
    CUSTOMER_ROLE_ID: "BURAYA_MUSTERI_ROL_ID_YAZ",
    DEPREM_CHANNEL_ID: "BURAYA_DEPREM_KANAL_ID_YAZ",
    WELCOME_CHANNEL_ID: "BURAYA_WELCOME_KANAL_ID_YAZ",
    ARCHIVE_CHANNEL_ID: "1469080536659001568", // YENİ: Ticket Arşiv Kanalı
 
    // ------------------- 7/24 SES AYARLARI -------------------
    VOICE_GUILD_ID: "1446824586808262709",
    VOICE_CHANNEL_ID: "1465453822204969154",
 
    // ------------------- LİSANS SİSTEMİ LİMİTLERİ -------------------
    DEFAULT_PAUSE_LIMIT: 2,
    DEFAULT_RESET_LIMIT: 1,
    VIP_PAUSE_LIMIT: 999,
    VIP_RESET_LIMIT: 5,
    // ------------------- TASARIM (RENK PALETİ) -------------------
    EMBED_COLOR: '#2B2D31',
    SUCCESS_COLOR: '#57F287',
    ERROR_COLOR: '#ED4245',
    INFO_COLOR: '#5865F2',
    GOLD_COLOR: '#F1C40F',
    // ------------------- DEPREM AYARLARI -------------------
    DEPREM_API_URL: 'https://deprem.afad.gov.tr/last-earthquakes.html', 
    DEPREM_CHECK_INTERVAL: 60000, 
    DEPREM_MIN_MAGNITUDE: 3.0, 
    // ------------------- WELCOMER AYARLARI -------------------
    WELCOME_SETTINGS: { 
        showUsername: true,
        showAvatar: true,
        showJoinDate: true,
        showAccountCreate: true,
        showMemberCount: true
    }
};

// ------------------- GLOBAL DEĞİŞKENLER -------------------
let isMaintenanceEnabled = false;
let loaderStatus = "UNDETECTED 🟢";
let lastEarthquakeTime = 0; 

// =============================================================================
// 1. WEB SERVER
// =============================================================================
const app = express();
app.get('/', (req, res) => {
    res.send({
        status: 'Online',
        system: 'SAHO CHEATS SYSTEM vFinal + Music + Deprem + Welcomer + AI + Archive',
        time: new Date().toISOString()
    });
});
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`🌍 [SERVER] Web sunucusu ${port} portunda başlatıldı.`);
});

// =============================================================================
// 2. BOT İSTEMCİSİ
// =============================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

// =============================================================================
// 3. KOMUT LİSTESİ
// =============================================================================
const commands = [
    // --- YENİ EKLENEN SİSTEM KOMUTLARI ---
    new SlashCommandBuilder().setName('ping').setDescription('🏓 Botun ve API\'nin anlık gecikme süresini (ms) gösterir.'),
    new SlashCommandBuilder().setName('guncelle').setDescription('🔄 (Admin) Botu yeniden başlatır, komutları günceller ve optimize eder.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // ------------------- VİTRİN VE ÜRÜN YÖNETİMİ -------------------
    new SlashCommandBuilder()
        .setName('format')
        .setDescription('📸 (Admin) Profesyonel ürün vitrini oluşturur.')
        .addStringOption(o => o.setName('urun').setDescription('Ürün Adı').setRequired(true))
        .addStringOption(o => o.setName('ozellikler').setDescription('Özellikler (virgülle ayrılmış, max 60)').setRequired(true))
        .addAttachmentOption(o => o.setName('gorsel1').setDescription('Ana Resim (Zorunlu)').setRequired(true))
        .addAttachmentOption(o => o.setName('gorsel2').setDescription('Ek Resim 1').setRequired(false))
        .addAttachmentOption(o => o.setName('gorsel3').setDescription('Ek Resim 2').setRequired(false))
        .addAttachmentOption(o => o.setName('gorsel4').setDescription('Ek Resim 3').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // ------------------- TICKET VE DESTEK -------------------
    new SlashCommandBuilder()
        .setName('ticket-kur')
        .setDescription('🎫 (Admin) Profesyonel Ticket Panelini Kurar.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('sss')
        .setDescription('❓ Sıkça Sorulan Sorular'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('📚 Bot kullanım rehberi ve tüm komutlar.'),
    // ------------------- YAPAY ZEKA -------------------
    new SlashCommandBuilder()
        .setName('ai-kur')
        .setDescription('🤖 (Admin) Troll Yapay Zeka kanalını belirler.')
        .addChannelOption(o => o.setName('kanal').setDescription('AI Kanalı').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // ------------------- DEPREM SİSTEMİ -------------------
    new SlashCommandBuilder()
        .setName('depremkur')
        .setDescription('🚨 (Admin) Deprem bildirim kanalını kurar.')
        .addChannelOption(o => o.setName('kanal').setDescription('Bildirim Kanalı').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // ------------------- WELCOMER SİSTEMİ -------------------
    new SlashCommandBuilder()
        .setName('welcomer-kur')
        .setDescription('👋 (Admin) Hoş geldin sistemini kurar.')
        .addChannelOption(o => o.setName('kanal').setDescription('Hoş Geldin Kanalı').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('welcomer-dashboard')
        .setDescription('⚙️ (Admin) Hoş geldin ayarlarını yönetir.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // ------------------- GÜVENLİK VE MODERASYON -------------------
    new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('☢️ (Admin) Kanalı siler ve aynı özelliklerle yeniden oluşturur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('🔒 (Admin) Kanalı kilitler.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('🔓 (Admin) Kanal kilidini açar.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
        .setName('dm')
        .setDescription('📨 (Admin) Bot üzerinden kullanıcıya özel mesaj atar.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kime?').setRequired(true))
        .addStringOption(o => o.setName('mesaj').setDescription('Ne yazılacak?').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('👢 (Admin) Kullanıcıyı sunucudan atar.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true))
        .addStringOption(o => o.setName('sebep').setDescription('Sebep').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('🔨 (Admin) Kullanıcıyı yasaklar.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true))
        .addStringOption(o => o.setName('sebep').setDescription('Sebep').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('🔓 (Admin) Kullanıcının yasağını kaldırır.')
        .addStringOption(o => o.setName('id').setDescription('Kullanıcı ID').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    new SlashCommandBuilder()
        .setName('temizle')
        .setDescription('🧹 (Admin) Sohbeti temizler.')
        .addIntegerOption(o => o.setName('sayi').setDescription('Silinecek miktar (1-100)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    new SlashCommandBuilder()
        .setName('bakim-modu')
        .setDescription('🔒 (Admin) Bakım modunu yönetir.')
        .addBooleanOption(o => o.setName('durum').setDescription('Açık mı?').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('karaliste-ekle')
        .setDescription('⛔ (Admin) Kullanıcıyı bot karalistesine alır.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('karaliste-cikar')
        .setDescription('✅ (Admin) Kullanıcıyı karalisteden çıkarır.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    // ------------------- YÖNETİM VE DURUM -------------------
    new SlashCommandBuilder()
        .setName('tum-lisanslar')
        .setDescription('📜 (Admin) Aktif tüm lisansları listeler.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('loader-durum')
        .setDescription('🛡️ (Admin) Loader güvenlik durumunu değiştirir.')
        .addStringOption(o => o.setName('durum').setDescription('Durum ne?').setRequired(true)
            .addChoices(
                {name:'🟢 UNDETECTED', value:'UNDETECTED 🟢'},
                {name:'🟡 TESTING', value:'TESTING 🟡'},
                {name:'🔴 DETECTED', value:'DETECTED 🔴'},
                {name:'🛠️ UPDATING', value:'UPDATING 🛠️'}
            ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('durum-guncelle')
        .setDescription('📊 (Admin) Ürünlerin durum tablosunu yayınlar.')
        .addStringOption(o => o.setName('urun').setDescription('Hile Seç').setRequired(true)
            .addChoices(
                { name: 'PC UID Bypass', value: 'PC UID Bypass' },
                { name: 'PC External', value: 'PC External' },
                { name: 'PC Mod Menü', value: 'PC Mod Menü' },
                { name: 'PC Fake Lag', value: 'PC Fake Lag' },
                { name: 'Android Fake Lag', value: 'Android Fake Lag' }
            ))
        .addStringOption(o => o.setName('durum').setDescription('Durum').setRequired(true)
            .addChoices(
                {name:'🟢 SAFE', value:'safe'},
                {name:'🔴 DETECTED', value:'detected'},
                {name:'🟡 UPDATING', value:'updating'}
            ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('duyuru')
        .setDescription('📢 (Admin) Özel embed ile duyuru yapar.')
        .addStringOption(o => o.setName('mesaj').setDescription('Mesaj').setRequired(true))
        .addChannelOption(o => o.setName('kanal').setDescription('Kanal').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('sunucu-bilgi')
        .setDescription('📊 Sunucu istatistiklerini gösterir.'),
    // ------------------- ÇARKIFELEK -------------------
    new SlashCommandBuilder()
        .setName('cevir')
        .setDescription('🎡 Şans Çarkı! (Ödül kazanma şansı).'),
    new SlashCommandBuilder()
        .setName('cark-oranlar')
        .setDescription('📊 Çarkıfelekteki ödüllerin oranlarını gösterir.'),
    new SlashCommandBuilder()
        .setName('cark-hak-ekle')
        .setDescription('🎡 (Admin) Kullanıcıya çark hakkı verir.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kişi').setRequired(true))
        .addIntegerOption(o => o.setName('adet').setDescription('Adet').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('referans')
        .setDescription('⭐ Hizmeti puanla ve yorum bırak.')
        .addIntegerOption(o => o.setName('puan').setDescription('Puan (1-5)').setRequired(true).setMinValue(1).setMaxValue(5))
        .addStringOption(o => o.setName('yorum').setDescription('Yorum').setRequired(true)),
    // ------------------- LİSANS İŞLEMLERİ -------------------
    new SlashCommandBuilder()
        .setName('lisansim')
        .setDescription('👤 Lisans durumunu ve panelini gör.'),
    new SlashCommandBuilder()
        .setName('vip-ekle')
        .setDescription('💎 (Admin) VIP lisans tanımlar.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true))
        .addStringOption(o => o.setName('key_ismi').setDescription('Key Adı').setRequired(true))
        .addIntegerOption(o => o.setName('gun').setDescription('Süre (Gün)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('kullanici-ekle')
        .setDescription('🛠️ (Admin) Normal lisans tanımlar.')
        .addUserOption(o => o.setName('kullanici').setDescription('Kullanıcı').setRequired(true))
        .addStringOption(o => o.setName('key_ismi').setDescription('Key Adı').setRequired(true))
        .addIntegerOption(o => o.setName('gun').setDescription('Süre (Gün)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('olustur')
        .setDescription('🛠️ (Admin) Boş (sahipsiz) key oluşturur.')
        .addIntegerOption(o => o.setName('gun').setDescription('Süre').setRequired(true))
        .addStringOption(o => o.setName('isim').setDescription('İsim (Opsiyonel)').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('sil')
        .setDescription('🗑️ (Admin) Key siler.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('hwid-hak-ekle')
        .setDescription('➕ (Admin) HWID hakkı ekler.')
        .addIntegerOption(o => o.setName('adet').setDescription('Adet').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('durdurma-hak-ekle')
        .setDescription('➕ (Admin) Durdurma hakkı ekler.')
        .addIntegerOption(o => o.setName('adet').setDescription('Adet').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

// =============================================================================
// 4. YARDIMCI FONKSİYONLAR
// =============================================================================
async function firebaseRequest(method, path, data = null) {
    const url = `${CONFIG.FIREBASE_URL}${path}.json?auth=${CONFIG.FIREBASE_SECRET}`;
    try {
        const payload = data ? JSON.stringify(data) : null;
        const response = await axios({
            method,
            url,
            data: payload,
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error("Firebase Hatası:", error.response ? error.response.data : error.message);
        return null;
    }
}

async function findUserKey(discordId) {
    const data = await firebaseRequest('get', '');
    if (!data) return null;
 
    for (const [key, value] of Object.entries(data)) {
        if (key.startsWith("_")) continue;
        if (typeof value === 'string') {
            const parts = value.split(',');
            if (parts.length > 4 && parts[4] === discordId) return { key, parts };
        }
    }
    return null;
}

async function checkPermission(userId) {
    if (userId === CONFIG.OWNER_ID) return true;
    const admins = await firebaseRequest('get', '_ADMINS_');
    return admins && admins[userId];
}

async function getNextTicketNumber() {
    let count = await firebaseRequest('get', '_TICKET_COUNT');
    if (!count) count = 0;
    count++;
    await firebaseRequest('put', '_TICKET_COUNT', count);
    return count;
}

async function sendLog(guild, content) {
    if (!guild || !CONFIG.LOG_CHANNEL_ID || CONFIG.LOG_CHANNEL_ID === "BURAYA_LOG_KANAL_ID_YAZ") return;
    const channel = guild.channels.cache.get(CONFIG.LOG_CHANNEL_ID);
    if (channel) channel.send({ content: content }).catch(() => {});
}

function createPanelPayload(key, parts) {
    while (parts.length < 8) parts.push("0");
 
    const isVIP = parts[7] === 'VIP';
    const LIMITS = {
        PAUSE: isVIP ? CONFIG.VIP_PAUSE_LIMIT : CONFIG.DEFAULT_PAUSE_LIMIT,
        RESET: isVIP ? CONFIG.VIP_RESET_LIMIT : CONFIG.DEFAULT_RESET_LIMIT
    };
 
    let [durum, pause, reset] = [parts[2], parseInt(parts[5] || 0), parseInt(parts[6] || 0)];
 
    const kalanPause = Math.max(0, LIMITS.PAUSE - pause);
    const kalanReset = Math.max(0, LIMITS.RESET - reset);
    const embed = new EmbedBuilder()
        .setTitle(`⚙️ LİSANS KONTROL: ${isVIP ? '💎 VIP' : '🛠️ STANDART'}`)
        .setDescription(`**Key:** \`${key}\`\n\nLisans durumunuz ve kontroller aşağıdadır.`)
        .setColor(isVIP ? 'Gold' : CONFIG.EMBED_COLOR)
        .addFields(
            { name: '📡 Durum', value: durum === 'aktif' ? '✅ **AKTİF**' : '⏸️ **DURAKLATILDI**', inline: true },
            { name: '🗓️ Bitiş', value: 'Otomatik Hesaplanıyor', inline: true },
            { name: '\u200B', value: '\u200B', inline: false },
            { name: '⏸️ Kalan Durdurma', value: isVIP ? '∞ (Sınırsız)' : `\`${kalanPause} / ${LIMITS.PAUSE}\``, inline: true },
            { name: '💻 Kalan Reset', value: `\`${kalanReset} / ${LIMITS.RESET}\``, inline: true }
        )
        .setFooter({ text: 'SAHO CHEATS Security Systems' })
        .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('toggle')
            .setLabel(durum === 'aktif' ? 'DURDUR (Pause)' : 'BAŞLAT (Resume)')
            .setStyle(durum === 'aktif' ? ButtonStyle.Danger : ButtonStyle.Success)
            .setEmoji(durum === 'aktif' ? '🛑' : '▶️')
            .setDisabled(durum === 'aktif' && !isVIP && kalanPause <= 0),
     
        new ButtonBuilder()
            .setCustomId('reset')
            .setLabel('HWID SIFIRLA')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄')
            .setDisabled(kalanReset <= 0)
    );
    return { embeds: [embed], components: [row] };
}

async function checkEarthquakes() {
    try {
        const response = await axios.get(CONFIG.DEPREM_API_URL);
        const html = response.data;
        const $ = cheerio.load(html);
        const earthquakes = [];
        $('table tr').each((i, row) => {
            if (i === 0) return; 
            const cols = $(row).find('td');
            if (cols.length >= 7) {
                const date_time_tr = $(cols[0]).text().trim();
                const date_time_utc = new Date(date_time_tr).toISOString(); 
                const magnitude = parseFloat($(cols[5]).text().trim());
                const depth_km = parseFloat($(cols[4]).text().trim());
                const location = $(cols[6]).text().trim();
                const eq = { magnitude, depth_km, location, date_time_tr, date_time_utc };
                earthquakes.push(eq);
            }
        });
        const newQuakes = earthquakes.filter(eq => eq.magnitude >= CONFIG.DEPREM_MIN_MAGNITUDE && new Date(eq.date_time_utc).getTime() > lastEarthquakeTime);
        if (newQuakes.length > 0) {
            lastEarthquakeTime = Math.max(...newQuakes.map(eq => new Date(eq.date_time_utc).getTime()));
            const channel = client.channels.cache.get(CONFIG.DEPREM_CHANNEL_ID);
            if (channel) {
                for (const eq of newQuakes) {
                    const embed = new EmbedBuilder()
                        .setTitle('🚨 DEPREM BİLDİRİMİ')
                        .setColor(CONFIG.ERROR_COLOR)
                        .addFields(
                            { name: 'Büyüklük', value: eq.magnitude.toString(), inline: true },
                            { name: 'Derinlik', value: `${eq.depth_km} km`, inline: true },
                            { name: 'Yer', value: eq.location },
                            { name: 'Türkiye Saati', value: eq.date_time_tr, inline: true },
                            { name: 'UTC', value: eq.date_time_utc, inline: true }
                        )
                        .setFooter({ text: 'Kaynak: AFAD' })
                        .setTimestamp();
                    channel.send({ embeds: [embed] });
                }
            }
        }
    } catch (error) {
        console.error('Deprem kontrol hatası:', error);
    }
}

async function getWelcomeSettings(guildId) {
    const settings = await firebaseRequest('get', `_WELCOME_SETTINGS_/${guildId}`);
    return settings || CONFIG.WELCOME_SETTINGS;
}
async function setWelcomeSettings(guildId, newSettings) {
    await firebaseRequest('put', `_WELCOME_SETTINGS_/${guildId}`, newSettings);
}

// =============================================================================
// 5. BOT EVENTS
// =============================================================================
client.once('ready', async () => {
    console.log(`\n=============================================`);
    console.log(`✅ BOT GİRİŞ YAPTI: ${client.user.tag}`);
    console.log(`🆔 BOT ID: ${client.user.id}`);
    console.log(`🚨 DEPREM SİSTEMİ AKTİF`);
    console.log(`👋 WELCOMER SİSTEMİ AKTİF`);
    console.log(`🤖 YAPAY ZEKA SİSTEMİ AKTİF`);
    console.log(`=============================================\n`);
 
    // 7/24 ses bağlantısı
    connectToVoice();

    // Dinamik durum döngüsü
    let index = 0;
    setInterval(() => {
        let totalVoice = 0;
        client.guilds.cache.forEach(g => totalVoice += g.voiceStates.cache.size);
        const activities = [
            `SAHO CHEATS`,
            `🔊 ${totalVoice} Kişi Seste`,
            `🛡️ Loader: ${loaderStatus}`,
            `7/24 Destek Hattı`,
            `🚨 Deprem İzliyor`,
            `🤖 Troll AI Aktif`
        ];
        client.user.setActivity({ name: activities[index], type: ActivityType.Playing });
        index = (index + 1) % activities.length;
    }, 5000);

    // Lisans süre kontrolü
    setInterval(async () => {
        const data = await firebaseRequest('get', '');
        if (!data) return;
     
        const today = new Date();
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith("_") || typeof value !== 'string') continue;
         
            let parts = value.split(',');
            if (parts[2] === 'bitik') continue;
         
            const startDate = new Date(parts[3]);
            const expiryDate = new Date(startDate);
            expiryDate.setDate(startDate.getDate() + parseInt(parts[1]));
         
            if (today > expiryDate) {
                parts[2] = 'bitik';
                await firebaseRequest('put', key, parts.join(','));
                console.log(`❌ [AUTO] Süre doldu: ${key}`);
            }
        }
    }, 3600000);

    // Deprem kontrol interval
    setInterval(checkEarthquakes, CONFIG.DEPREM_CHECK_INTERVAL);
    checkEarthquakes(); 

    // Komut yükleme
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('🔄 Komutlar API\'ye yükleniyor...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✨ Komutlar başarıyla yüklendi!');
    } catch (e) { console.error('Komut hatası:', e); }
});

// 7/24 ses bağlantısı
async function connectToVoice() {
    const guild = client.guilds.cache.get(CONFIG.VOICE_GUILD_ID);
    if (!guild) return console.log("❌ [SES] Hedef sunucu bulunamadı!");
    const channel = guild.channels.cache.get(CONFIG.VOICE_CHANNEL_ID);
    if (!channel) return console.log("❌ [SES] Hedef ses kanalı bulunamadı!");
    try {
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: true
        });
        console.log(`🔊 [SES] ${channel.name} kanalına bağlanıldı!`);
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            console.log("⚠️ [SES] Bağlantı koptu! Tekrar bağlanılıyor...");
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch (error) {
                connection.destroy();
                connectToVoice();
            }
        });
    } catch (error) {
        console.error("❌ [SES HATASI]:", error);
        setTimeout(connectToVoice, 5000);
    }
}

// Hoş geldin mesajı
client.on('guildMemberAdd', async member => {
    const channelId = CONFIG.WELCOME_CHANNEL_ID;
    if (!channelId || channelId === "BURAYA_WELCOME_KANAL_ID_YAZ") return;
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) return;
 
    const settings = await getWelcomeSettings(member.guild.id);
    const embed = new EmbedBuilder()
        .setTitle('🚀 SAHO CHEATS AİLESİNE HOŞ GELDİN!')
        .setColor(CONFIG.EMBED_COLOR)
        .setThumbnail(settings.showAvatar ? member.user.displayAvatarURL({ dynamic: true }) : null)
        .addFields(
            settings.showUsername ? { name: 'Kullanıcı', value: member.user.tag, inline: true } : null,
            settings.showAccountCreate ? { name: 'Hesap Oluşturma', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true } : null,
            settings.showJoinDate ? { name: 'Katılım Tarihi', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true } : null,
            settings.showMemberCount ? { name: 'Üye Sırası', value: `${member.guild.memberCount}. üye`, inline: true } : null
        )
        .setFooter({ text: 'SAHO CHEATS Community' });
     
    channel.send({ content: `${member.user}`, embeds: [embed] });
});

// =============================================================================
// OTO MODERASYON, OTO CEVAP VE TROLL YAPAY ZEKA (AI)
// =============================================================================
const KUFURLER = ["amk", "aq", "sik", "oç", "piç", "yavşak", "sürtük", "göt"];
const REKLAM_REGEX = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,}|discord\.gg\/[a-zA-Z0-9]+)/gi;

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    const isAdmin = message.member?.permissions.has(PermissionsBitField.Flags.Administrator);
    const content = message.content.toLowerCase();

    // 1. ERENSİ TARZI OTO-MODERASYON
    if (!isAdmin) {
        if (REKLAM_REGEX.test(content)) {
            await message.delete().catch(() => {});
            return message.channel.send(`⛔ **${message.author}**, bu sunucuda link veya reklam paylaşmak yasak koçum! Akıllı ol.`);
        }
        const kufurVarMi = KUFURLER.some(kufur => new RegExp(`\\b${kufur}\\b`, 'i').test(content));
        if (kufurVarMi) {
            await message.delete().catch(() => {});
            return message.channel.send(`🤬 **${message.author}**, ağzını topla kankam! Burada küfür yasak.`);
        }
    }

    // 2. OTO CEVAPLAR
    if (content.includes('fiyat') || content.includes('kaç tl') || content.includes('ne kadar')) {
        return message.reply({
            content: `👋 Merhaba **${message.author.username}**! \n💰 Güncel fiyat listesi için <#${CONFIG.LOG_CHANNEL_ID}> kanalına bakabilir veya \`/ticket-kur\` komutuyla ticket açarak öğrenebilirsin.`,
            allowedMentions: { repliedUser: true }
        });
    }
    if (content.includes('nasıl alırım') || content.includes('satın al') || content.includes('ödeme')) {
        return message.reply({
            content: `🛒 Satın almak için lütfen **Ticket** açınız. Yetkililerimiz size yardımcı olacaktır.`,
            allowedMentions: { repliedUser: true }
        });
    }

    // 3. TROLL AI SOHBET SİSTEMİ (GÜNCELLENDİ: HATA DEDEKTÖRLÜ & YENİ MODEL)
    try {
        const aiChannelId = await firebaseRequest('get', '_AI_CHANNEL_');
        if (aiChannelId && message.channel.id === aiChannelId) {
            
            if (!message.content || message.content.trim() === "") return;

            if (content.includes("ananı skm") || content.includes("ananı sikiyim")) {
                return message.reply("bende senin ananı skym asdasdasdasd uza lan buradan 🤣");
            }
            if (content.includes("oç") || content.includes("orospu")) {
                return message.reply("sensin oç aynaya bak da konuş qweqweqwe 😂");
            }

            await message.channel.sendTyping();
            
            if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "BOS") {
                return message.reply("⚠️ Kanka Render'da GEMINI_API_KEY şifresini algılamadı. Ayarları kontrol edip Render'ı 'Clear Cache & Deploy' yapsana.");
            }

            // MODEL İSMİ BURADA GÜNCELLENDİ
            const model = genAI.getGenerativeModel({ 
                model: "gemini-1.5-flash-latest", // <---- HATAYI ÇÖZEN KISIM
                systemInstruction: "Sen Discord'da takılan, çok laubali, sarkastik, biraz troll ve kafa dengi bir botsun. İnsanlara 'kanka', 'birader', 'olum' diye hitap et. Çok ciddi cevaplar verme, ironi yap. Arada cümle sonlarına 'asdasd', 'qweqwe' veya random harfler (jsjsjs) ekleyerek gül. Kısa ve net cevaplar ver. Biri sana laf atarsa altta kalma, lafı yapıştır.",
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                ]
            });

            const result = await model.generateContent(message.content.toString());
            const responseText = result.response.text();

            if (!responseText) throw new Error("Google filtrelediği için boş döndü.");
            return message.reply(responseText);
        }
    } catch (error) {
        console.error("🔥 AI KESİN HATA LOGU:", error);
        
        // Hata mesajını direk chat'e atıyor ki neyin patladığını görelim
        const errorMsg = error.message ? error.message : "Bilinmeyen hata amk";
        return message.reply(`⚠️ **Kanka bir boklar oldu aq!** Hata detayı: \`${errorMsg}\``);
    }
});

// =============================================================================
// 6. ETKİLEŞİM YÖNETİCİSİ (ZIRHLI TRY-CATCH)
// =============================================================================
client.on('interactionCreate', async interaction => {
    try {
        const blacklist = await firebaseRequest('get', '_BLACKLIST_');
        if (blacklist && blacklist[interaction.user.id]) {
            return interaction.reply({ content: '⛔ **SİSTEM TARAFINDAN ENGELLENDİNİZ.**', ephemeral: true });
        }
     
        if (interaction.isStringSelectMenu()) return await handleSelectMenu(interaction);
        if (interaction.isButton()) return await handleButton(interaction);
        if (interaction.isChatInputCommand()) return await handleCommand(interaction);
    } catch (e) { console.error('Etkileşim Hatası (Gözardı Edildi):', e.message); }
});

// =============================================================================
// 7. SLASH KOMUT HANDLER
// =============================================================================
async function handleCommand(interaction) {
    const { commandName, options, user, guild } = interaction;
    try {
        // ==================== YENİ EKLENEN SİSTEM KOMUTLARI ====================
        if (commandName === 'ping') {
            const sent = await interaction.reply({ content: '🏓 Hesaplanıyor...', fetchReply: true, ephemeral: true });
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            return interaction.editReply(`🏓 **Pong!**\n> 🤖 Bot Gecikmesi: \`${latency}ms\`\n> 🌐 API Gecikmesi: \`${Math.round(client.ws.ping)}ms\``);
        }

        if (commandName === 'guncelle') {
            await interaction.reply({ content: '🔄 **Sistem optimize ediliyor, komutlar güncelleniyor ve bot yeniden başlatılıyor...**', ephemeral: true });
            try {
                const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
                await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
                sendLog(guild, `🔄 **SİSTEM GÜNCELLENDİ**\n**Yetkili:** ${user.tag}\nBot yeniden başlatılıyor...`);
                // Botu kapatıp Render'ın veya PM2'nin yeniden başlatmasını sağlar
                setTimeout(() => { process.exit(1); }, 2000);
                return;
            } catch (error) {
                return interaction.editReply('❌ Güncelleme sırasında bir hata oluştu.');
            }
        }

        if (commandName === 'ai-kur') {
            const kanal = options.getChannel('kanal');
            await firebaseRequest('put', '_AI_CHANNEL_', kanal.id);
            return interaction.reply({ content: `✅ AI Sohbet kanalı ${kanal} olarak ayarlandı. Artık botla oradan makara yapabilirsiniz!`, ephemeral: true });
        }
        if (commandName === 'depremkur') {
            const kanal = options.getChannel('kanal');
            CONFIG.DEPREM_CHANNEL_ID = kanal.id;
            return interaction.reply({ content: `✅ Deprem bildirimleri ${kanal} kanalına ayarlandı!`, ephemeral: true });
        }
        if (commandName === 'welcomer-kur') {
            const kanal = options.getChannel('kanal');
            CONFIG.WELCOME_CHANNEL_ID = kanal.id;
            return interaction.reply({ content: `✅ Hoş geldin sistemi ${kanal} kanalına kuruldu!`, ephemeral: true });
        }
        if (commandName === 'welcomer-dashboard') {
            const settings = await getWelcomeSettings(guild.id);
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Welcomer Ayarları')
                .setDescription('Ayarları yönetmek için menüyü kullanın.')
                .setColor(CONFIG.INFO_COLOR);
            const menu = new StringSelectMenuBuilder()
                .setCustomId('welcomer_toggle')
                .setPlaceholder('Ayar Seç...')
                .addOptions(
                    { label: 'Kullanıcı Adı Göster', value: 'showUsername', description: settings.showUsername ? 'Açık' : 'Kapalı' },
                    { label: 'Avatar Göster', value: 'showAvatar', description: settings.showAvatar ? 'Açık' : 'Kapalı' },
                    { label: 'Katılım Tarihi Göster', value: 'showJoinDate', description: settings.showJoinDate ? 'Açık' : 'Kapalı' },
                    { label: 'Hesap Oluşturma Göster', value: 'showAccountCreate', description: settings.showAccountCreate ? 'Açık' : 'Kapalı' },
                    { label: 'Üye Sırası Göster', value: 'showMemberCount', description: settings.showMemberCount ? 'Açık' : 'Kapalı' }
                );
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }

        // ==================== DİĞER ORİJİNAL KOMUTLAR ====================
        if (commandName === 'nuke') {
            const channel = interaction.channel;
            const position = channel.position;
            const topic = channel.topic;
         
            await interaction.reply('☢️ **Kanal patlatılıyor...**');
         
            const newChannel = await channel.clone();
            await newChannel.setPosition(position);
            if (topic) await newChannel.setTopic(topic);
         
            await channel.delete();
         
            const nukeEmbed = new EmbedBuilder()
                .setTitle('☢️ KANAL TEMİZLENDİ')
                .setDescription('Bu kanal **SAHO CHEATS** yönetim tarafından sıfırlandı.')
                .setImage('https://media1.tenor.com/m/X9kZ5h7qK64AAAAC/nuclear-bomb-explosion.gif')
                .setColor(CONFIG.ERROR_COLOR);
             
            return newChannel.send({ embeds: [nukeEmbed] });
        }
        if (commandName === 'lock') {
            await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
            return interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔒 **Kanal kilitlendi.**').setColor(CONFIG.ERROR_COLOR)] });
        }
        if (commandName === 'unlock') {
            await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
            return interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔓 **Kanal kilidi açıldı.**').setColor(CONFIG.SUCCESS_COLOR)] });
        }
        if (commandName === 'format') {
            const urun = options.getString('urun');
            const ozelliklerStr = options.getString('ozellikler');
            const ozellikler = ozelliklerStr.split(',').slice(0, 60); // Max 60
           
            const gorsel1 = options.getAttachment('gorsel1');
            const gorsel2 = options.getAttachment('gorsel2');
            const gorsel3 = options.getAttachment('gorsel3');
            const gorsel4 = options.getAttachment('gorsel4');
            const embeds = [];
            const mainEmbed = new EmbedBuilder()
                .setTitle(`💎 ${urun}`)
                .setDescription(`> **${urun}** en güncel sürümüyle stoklarda!\n> Satın almak için: Ticket açın.`)
                .setColor(CONFIG.GOLD_COLOR)
                .setImage(gorsel1.url)
                .setFooter({ text: 'SAHO CHEATS Marketplace', iconURL: guild.iconURL() });
            let ozellikFields = '';
            ozellikler.forEach((oz, i) => ozellikFields += `${i+1}. ${oz.trim()}\n`);
            mainEmbed.addFields({ name: '✨ Özellikler', value: ozellikFields || 'Özellik yok.' });
            embeds.push(mainEmbed);
            if (gorsel2) embeds.push(new EmbedBuilder().setURL('https://discord.gg/sahocheats').setImage(gorsel2.url).setColor(CONFIG.GOLD_COLOR));
            if (gorsel3) embeds.push(new EmbedBuilder().setURL('https://discord.gg/sahocheats').setImage(gorsel3.url).setColor(CONFIG.GOLD_COLOR));
            if (gorsel4) embeds.push(new EmbedBuilder().setURL('https://discord.gg/sahocheats').setImage(gorsel4.url).setColor(CONFIG.GOLD_COLOR));
            await interaction.channel.send({ embeds: embeds });
            return interaction.reply({ content: '✅ Vitrin güncellendi!', ephemeral: true });
        }
        if (commandName === 'ticket-kur') {
            const embed = new EmbedBuilder()
                .setTitle('🔥 SAHO CHEATS | PROFESYONEL DESTEK MERKEZİ')
                .setDescription(`
                **Hoş Geldiniz, Değerli Müşterimiz!**
             
                SAHO CHEATS olarak premium hizmet sunuyoruz.
                Aşağıdaki menüden kategorinizi seçin ve anında destek alın.
                `)
                .setColor(CONFIG.GOLD_COLOR)
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/4712/4712109.png')
                .setImage('https://example.com/profesyonel-banner.gif') // Banner resim ekle
                .setFooter({ text: 'SAHO CHEATS | Hızlı & Güvenilir Destek', iconURL: client.user.avatarURL() });
            const menu = new StringSelectMenuBuilder()
                .setCustomId('ticket_create_menu')
                .setPlaceholder('📩 Destek Kategorisi Seçin...')
                .addOptions(
                    { label: 'Satın Alım & Fiyat Bilgisi', description: 'Ürün satın alma ve fiyatlar hakkında.', value: 'cat_buy', emoji: '💳' },
                    { label: 'Teknik Destek & Kurulum', description: 'Yazılım kurulum ve sorun giderme.', value: 'cat_tech', emoji: '🛠️' },
                    { label: 'Genel Sorular & Ortaklık', description: 'Diğer konular ve işbirliği.', value: 'cat_other', emoji: '🤝' }
                );
            const row = new ActionRowBuilder().addComponents(menu);
            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✅ Profesyonel ticket paneli kuruldu!', ephemeral: true });
        }
        if (commandName === 'sss') {
            const embed = new EmbedBuilder()
                .setTitle('❓ SIKÇA SORULAN SORULAR')
                .setDescription('Aşağıdaki menüden merak ettiğiniz konuyu seçin.')
                .setColor(CONFIG.INFO_COLOR)
                .setFooter({ text: 'SAHO CHEATS Knowledge Base' });
             
            const menu = new StringSelectMenuBuilder()
                .setCustomId('faq_select')
                .setPlaceholder('Bir konu seçin...')
                .addOptions(
                    { label: 'Ban Riski Var Mı?', description: 'Güvenlik durumu hakkında bilgi.', value: 'faq_ban', emoji: '🛡️' },
                    { label: 'Nasıl Satın Alırım?', description: 'Ödeme yöntemleri ve teslimat.', value: 'faq_buy', emoji: '💳' },
                    { label: 'İade Var Mı?', description: 'İade politikamız.', value: 'faq_refund', emoji: '🔄' },
                    { label: 'Destek Saatleri', description: 'Ne zaman cevap alabilirim?', value: 'faq_support', emoji: '⏰' },
                    { label: 'Kurulum Zor Mu?', description: 'Teknik bilgi gerekir mi?', value: 'faq_install', emoji: '🛠️' }
                );
             
            return interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
        }
        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle('📚 SAHO CHEATS | BOT YARDIM MENÜSÜ')
                .setColor(CONFIG.EMBED_COLOR)
                .setDescription('Botun tüm komutları aşağıda listelenmiştir.')
                .addFields(
                    { name: '👤 **Kullanıcı Komutları**', value: '> `/lisansim`, `/cevir`, `/sss`, `/referans`' },
                    { name: '🛡️ **Yetkili Komutları**', value: '> `/format`, `/ticket-kur`, `/durum-guncelle`, `/loader-durum`\n> `/dm`, `/nuke`, `/lock`, `/unlock`, `/kick`, `/ban`\n> `/vip-ekle`, `/tum-lisanslar`, `/depremkur`, `/welcomer-kur`, `/welcomer-dashboard`, `/ai-kur`, `/ping`, `/guncelle`' }
                )
                .setFooter({ text: 'SAHO CHEATS Automation' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (commandName === 'tum-lisanslar') {
            await interaction.deferReply({ ephemeral: true });
            const data = await firebaseRequest('get', '');
            if (!data) return interaction.editReply('Veri bulunamadı.');
            let text = "**📜 AKTİF LİSANSLAR LİSTESİ**\n\n";
            let count = 0;
            for (const [key, value] of Object.entries(data)) {
                if (key.startsWith("_") || typeof value !== 'string') continue;
                let parts = value.split(',');
                if (parts[4] !== "0") {
                    text += `🔑 \`${key}\` - <@${parts[4]}> (${parts[7] || 'NORMAL'})\n`;
                    count++;
                }
            }
            if (count === 0) text += "🚫 Hiçbir kullanıcıya lisans tanımlanmamış.";
            const embed = new EmbedBuilder().setDescription(text.substring(0, 4000)).setColor(CONFIG.EMBED_COLOR).setFooter({ text: `Toplam ${count} aktif lisans` });
            return interaction.editReply({ embeds: [embed] });
        }
        if (commandName === 'loader-durum') {
            loaderStatus = options.getString('durum');
            return interaction.reply({ content: `🛡️ Loader durumu güncellendi: **${loaderStatus}**`, ephemeral: true });
        }
        if (commandName === 'lisansim') {
            await interaction.deferReply({ ephemeral: true });
            const result = await findUserKey(user.id);
            if (!result) return interaction.editReply('❌ **Sisteme kayıtlı bir lisansınız bulunmamaktadır.**');
            return interaction.editReply(createPanelPayload(result.key, result.parts));
        }
        if (commandName === 'dm') {
            const targetUser = options.getUser('kullanici');
            const msg = options.getString('mesaj');
            try {
                const embed = new EmbedBuilder()
                    .setTitle('📨 SAHO CHEATS MESAJ')
                    .setDescription(msg)
                    .setColor(CONFIG.EMBED_COLOR)
                    .setFooter({text:'Bu mesaj yetkililer tarafından gönderildi.'});
                await targetUser.send({embeds: [embed]});
                return interaction.reply({content:`✅ Mesaj **${targetUser.tag}** kullanıcısına gönderildi.`, ephemeral:true});
            } catch (e) {
                return interaction.reply({content:'❌ Kullanıcının DM kutusu kapalı.', ephemeral:true});
            }
        }
        if (commandName === 'kick') {
            const targetUser = options.getUser('kullanici');
            const reason = options.getString('sebep') || 'Sebep belirtilmedi';
            const member = guild.members.cache.get(targetUser.id);
            if (!member) return interaction.reply({content:'Kullanıcı sunucuda bulunamadı.', ephemeral:true});
            if (!member.kickable) return interaction.reply({content:'Bu kullanıcıyı atamam (Yetkim yetersiz).', ephemeral:true});
            await member.kick(reason);
            const embed = new EmbedBuilder()
                .setTitle('👢 KICK İŞLEMİ')
                .setDescription(`**Atılan:** ${targetUser.tag}\n**Sebep:** ${reason}\n**Yetkili:** ${user.tag}`)
                .setColor(CONFIG.ERROR_COLOR);
            return interaction.reply({embeds: [embed]});
        }
        if (commandName === 'ban') {
            const targetUser = options.getUser('kullanici');
            const reason = options.getString('sebep') || 'Sebep yok';
            const member = guild.members.cache.get(targetUser.id);
            if (!member) return interaction.reply({ content: '❌ Kullanıcı yok.', ephemeral: true });
            if (!member.bannable) return interaction.reply({ content: '❌ Yasaklayamıyorum.', ephemeral: true });
            await member.ban({ reason: reason });
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔨 YASAKLAMA').setDescription(`**Yasaklanan:** ${targetUser.tag}\n**Sebep:** ${reason}`).setColor(CONFIG.ERROR_COLOR)] });
        }
        if (commandName === 'unban') {
            const targetId = options.getString('id');
            try {
                await guild.members.unban(targetId);
                return interaction.reply({ content: `✅ **${targetId}** yasağı kaldırıldı.`, ephemeral: true });
            } catch (error) {
                return interaction.reply({ content: '❌ Hata.', ephemeral: true });
            }
        }
        if (commandName === 'bakim-modu') {
            isMaintenanceEnabled = options.getBoolean('durum');
            return interaction.reply({content: `🔒 Bakım: ${isMaintenanceEnabled}`, ephemeral:true});
        }
        if (commandName === 'temizle') {
            const amount = options.getInteger('sayi');
            await interaction.channel.bulkDelete(amount, true).catch(() => {});
            return interaction.reply({ content: `🧹 **${amount}** mesaj silindi.`, ephemeral: true });
        }
        if (commandName === 'duyuru') {
            const mesaj = options.getString('mesaj');
            const targetChannel = options.getChannel('kanal') || interaction.channel;
            const embed = new EmbedBuilder()
                .setTitle('📢 SAHO CHEATS DUYURU')
                .setDescription(mesaj)
                .setColor(CONFIG.EMBED_COLOR)
                .setFooter({ text: guild.name })
                .setTimestamp();
            await targetChannel.send({ content: '@everyone', embeds: [embed] });
            return interaction.reply({ content: '✅', ephemeral: true });
        }
        if (commandName === 'sunucu-bilgi') {
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${guild.name}`)
                .addFields(
                    { name: '👥 Üye', value: `${guild.memberCount}`, inline: true }
                )
                .setColor(CONFIG.EMBED_COLOR);
            return interaction.reply({ embeds: [embed] });
        }
        if (commandName === 'karaliste-ekle') {
            const target = options.getUser('kullanici');
            await firebaseRequest('patch', '_BLACKLIST_', { [target.id]: "BAN" });
            return interaction.reply({ content: `⛔ **${target.tag}** engellendi.`, ephemeral: true });
        }
        if (commandName === 'karaliste-cikar') {
            const target = options.getUser('kullanici');
            const url = `${CONFIG.FIREBASE_URL}_BLACKLIST_/${target.id}.json?auth=${CONFIG.FIREBASE_SECRET}`;
            await axios.delete(url);
            return interaction.reply({ content: `✅ **${target.tag}** engeli kalktı.`, ephemeral: true });
        }
        if (commandName === 'durum-guncelle') {
            const urun = options.getString('urun');
            const durum = options.getString('durum');
            let color, statusText, emoji;
            if (durum === 'safe') { color = 'Green'; statusText = 'SAFE / GÜVENLİ'; emoji = '🟢'; }
            else if (durum === 'detected') { color = 'Red'; statusText = 'DETECTED / RİSKLİ'; emoji = '🔴'; }
            else { color = 'Yellow'; statusText = 'UPDATING / BAKIMDA'; emoji = '🟡'; }
            const embed = new EmbedBuilder()
                .setTitle(`${emoji} DURUM BİLGİSİ`)
                .addFields(
                    { name: '📂 Yazılım', value: `**${urun}**`, inline: true },
                    { name: '📡 Durum', value: `\`${statusText}\``, inline: true }
                )
                .setColor(color)
                .setFooter({ text: 'SAHO CHEATS Status' });
            await interaction.channel.send({ embeds: [embed] });
            return interaction.reply({ content: '✅', ephemeral: true });
        }
        if (commandName === 'cark-hak-ekle') {
            const target = options.getUser('kullanici');
            const adet = options.getInteger('adet');
            let currentRight = await firebaseRequest('get', `_SPIN_RIGHTS_/${target.id}`);
            if (!currentRight) currentRight = 0; else currentRight = parseInt(currentRight);
            await firebaseRequest('put', `_SPIN_RIGHTS_/${target.id}`, currentRight + adet);
            return interaction.reply({ content: `✅ **${target.tag}** kullanıcısına **+${adet}** hak eklendi.`, ephemeral: true });
        }
        if (commandName === 'cark-oranlar') {
            const embed = new EmbedBuilder()
                .setTitle('🎡 SAHO CHEATS | ORANLAR')
                .setDescription('💎 %0.5 External\n🔥 %1.5 Bypass\n👑 %3.0 Mod Menü\n🎫 %10 İndirim\n❌ %85 PAS')
                .setColor('Gold');
            return interaction.reply({ embeds: [embed] });
        }
        if (commandName === 'referans') {
            const puan = options.getInteger('puan');
            const yorum = options.getString('yorum');
            const stars = '⭐'.repeat(puan);
            const embed = new EmbedBuilder()
                .setAuthor({ name: `${user.username} referans bıraktı!`, iconURL: user.displayAvatarURL() })
                .setDescription(`**Puan:** ${stars}\n**Yorum:** ${yorum}`)
                .setColor('Gold');
            const vouchChannel = guild.channels.cache.find(c => c.name.includes('referans') || c.name.includes('vouch'));
            if (vouchChannel) {
                await vouchChannel.send({ embeds: [embed] });
                return interaction.reply({ content: '❤️', ephemeral: true });
            } else return interaction.reply({ content: 'Kanal bulunamadı.', ephemeral: true });
        }
        if (commandName === 'cevir') {
            await interaction.deferReply();
            let extraRights = await firebaseRequest('get', `_SPIN_RIGHTS_/${user.id}`);
            if (!extraRights) extraRights = 0; else extraRights = parseInt(extraRights);
         
            let usedExtra = false;
            if (extraRights > 0) {
                extraRights--;
                await firebaseRequest('put', `_SPIN_RIGHTS_/${user.id}`, extraRights);
                usedExtra = true;
            } else {
                const spinData = await firebaseRequest('get', `_SPIN_TIMES_/${user.id}`);
                const now = Date.now();
                const cooldown = 24 * 60 * 60 * 1000;
                if (spinData) {
                    const lastSpin = parseInt(spinData);
                    if (now - lastSpin < cooldown) return interaction.editReply(`⏳ **Günlük hakkın doldu!**\nTekrar denemek için: <t:${Math.floor((lastSpin + cooldown) / 1000)}:R>`);
                }
                await firebaseRequest('patch', '_SPIN_TIMES_', { [user.id]: now });
            }
            const items = [
                { name: "1 AYLIK EXTERNAL 💎", chance: 5, type: 'legendary' },
                { name: "1 HAFTALIK BYPASS 🔥", chance: 15, type: 'epic' },
                { name: "1 GÜNLÜK MOD MENU 👑", chance: 30, type: 'rare' },
                { name: "%10 İndirim Kuponu 🎫", chance: 100, type: 'common' },
                { name: "PAS (Tekrar Dene) ❌", chance: 850, type: 'lose' }
            ];
            const totalWeight = items.reduce((sum, item) => sum + item.chance, 0);
            let random = Math.floor(Math.random() * totalWeight);
            let selectedItem = items[0];
            for (const item of items) {
                if (random < item.chance) {
                    selectedItem = item;
                    break;
                }
                random -= item.chance;
            }
            let color = CONFIG.EMBED_COLOR;
            let description = "";
            let footerText = usedExtra ? `Ekstra hak kullanıldı. Kalan: ${extraRights}` : `${user.username} günlük hakkını kullandı`;
            if (selectedItem.type === 'legendary' || selectedItem.type === 'epic' || selectedItem.type === 'rare') {
                color = 'Gold';
                description = `🎉 **TEBRİKLER! ÖDÜL KAZANDIN!**\n\nKazandığın: **${selectedItem.name}**\n\n*Hemen ticket aç ve bu ekranın görüntüsünü at!*`;
            } else if (selectedItem.type === 'lose') {
                color = 'Red';
                description = `📉 **Maalesef...**\n\nSonuç: **${selectedItem.name}**\n\n*Yarın tekrar gel veya hak satın al!*`;
            } else {
                color = 'Blue';
                description = `👍 **Fena Değil!**\n\nKazandığın: **${selectedItem.name}**\n*Ticket açıp indirimini kullanabilirsin.*`;
            }
         
            const embed = new EmbedBuilder()
                .setTitle('🎡 SAHO CHEATS ÇARKIFELEK')
                .setDescription(description)
                .setColor(color)
                .setFooter({ text: footerText });
             
            return interaction.editReply({ embeds: [embed] });
        }
        if (['vip-ekle', 'kullanici-ekle', 'olustur', 'sil', 'hwid-hak-ekle', 'durdurma-hak-ekle'].includes(commandName)) {
            if (commandName === 'hwid-hak-ekle' || commandName === 'durdurma-hak-ekle') {
                await interaction.deferReply({ ephemeral: true });
                const data = await firebaseRequest('get', '');
                if (!data) return interaction.editReply('Veri yok.');
                const keys = Object.keys(data).filter(k => !k.startsWith("_")).slice(0, 25);
                const adet = options.getInteger('adet');
                const type = commandName === 'hwid-hak-ekle' ? 'hwid' : 'durdurma';
                const menu = new StringSelectMenuBuilder()
                    .setCustomId(`add_right_${type}_${adet}`)
                    .setPlaceholder('Key Seç...')
                    .addOptions(keys.map(k => new StringSelectMenuOptionBuilder().setLabel(k).setValue(k).setEmoji('➕')));
                return interaction.editReply({ content: `👇 **${type.toUpperCase()} Ekle:**`, components: [new ActionRowBuilder().addComponents(menu)] });
            }
            if (commandName === 'sil') {
                await interaction.deferReply({ ephemeral: true });
                const data = await firebaseRequest('get', '');
                if (!data) return interaction.editReply('Veri yok.');
                const keys = Object.keys(data).filter(k => !k.startsWith("_")).slice(0, 25);
                const menu = new StringSelectMenuBuilder()
                    .setCustomId('delete_key')
                    .setPlaceholder('Sil...')
                    .addOptions(keys.map(k => new StringSelectMenuOptionBuilder().setLabel(k).setValue(k).setEmoji('🗑️')));
                return interaction.editReply({ content: '🗑️ **Sil:**', components: [new ActionRowBuilder().addComponents(menu)] });
            }
            if (commandName.includes('ekle')) {
                await interaction.deferReply({ ephemeral: true });
                const target = options.getUser('kullanici');
                const key = options.getString('key_ismi').toUpperCase();
                const gun = options.getInteger('gun');
                const isVip = commandName === 'vip-ekle';
                const data = `bos,${gun},aktif,${new Date().toISOString().split('T')[0]},${target.id},0,0,${isVip ? 'VIP' : 'NORMAL'}`;
                await firebaseRequest('put', key, data);
                const payload = createPanelPayload(key, data.split(','));
                sendLog(guild, `🚨 **LİSANS OLUŞTURULDU**\n**Yönetici:** ${user.tag}\n**Key:** ${key}`);
                await interaction.editReply({ content: `✅ **${target.username}** tanımlandı.` });
                try {
                    await target.send({ content: `🎉 **Lisansınız Hazır!**`, embeds: payload.embeds, components: payload.components });
                } catch (e) {}
                return;
            }
            if (commandName === 'olustur') {
                const gun = options.getInteger('gun');
                let key = options.getString('isim') || "KEY-" + Math.random().toString(36).substring(2, 8).toUpperCase();
                await firebaseRequest('put', key.toUpperCase(), `bos,${gun},aktif,${new Date().toISOString().split('T')[0]},0,0,0,NORMAL`);
                return interaction.reply({ content: `🔑 **Boş Key:** \`${key.toUpperCase()}\``, ephemeral: true });
            }
        }
    } catch (error) {
        console.error("Komut işlenirken hata oluştu:", error);
    }
}

// =============================================================================
// 8. BUTON HANDLER VE TICKET ARŞİV SİSTEMİ
// =============================================================================
async function handleButton(interaction) {
    const { customId, user, guild, channel } = interaction;
    try {
        if (customId === 'close_ticket') {
            await interaction.reply({ embeds: [new EmbedBuilder().setDescription('🔒 **Ticket kapatılıyor ve arşivleniyor...**').setColor(CONFIG.ERROR_COLOR)] });

            // Arşivleme İşlemi (Gelişmiş Döküm)
            try {
                const messages = await channel.messages.fetch({ limit: 100 });
                const archiveChannel = client.channels.cache.get(CONFIG.ARCHIVE_CHANNEL_ID);
                if (archiveChannel) {
                    let transcript = messages.reverse().map(m => `[${m.createdAt.toLocaleTimeString()}] ${m.author.tag}: ${m.content}`).join('\n');
                    if (transcript.length > 4000) transcript = transcript.substring(0, 3995) + '...';
                    
                    const archiveEmbed = new EmbedBuilder()
                        .setTitle(`📁 TICKET ARŞİVİ: ${channel.name}`)
                        .setDescription(`**Kapatan:** ${user.tag}\n\n**Mesaj Geçmişi:**\n\`\`\`text\n${transcript || "Mesaj yok."}\n\`\`\``)
                        .setColor(CONFIG.INFO_COLOR)
                        .setTimestamp();
                    await archiveChannel.send({ embeds: [archiveEmbed] });
                }
            } catch (err) {
                console.error("Ticket arşivlenirken hata:", err);
            }

            sendLog(guild, `📕 **TICKET ARŞİVLENDİ VE KAPATILDI**\n**Kapatan:** ${user.tag}\n**Kanal:** ${channel.name}`);
            setTimeout(() => channel.delete().catch(() => {}), 4000);
            return;
        }
        else if (customId === 'claim_ticket') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels))
                return interaction.reply({ content: '⛔ Yetkisiz!', ephemeral: true });
            return channel.send({ embeds: [new EmbedBuilder()
                .setDescription(`✅ Bu talep **${user}** tarafından devralındı.`)
                .setColor(CONFIG.SUCCESS_COLOR)] });
        }
        
        if (['toggle', 'reset'].includes(customId)) {
            await interaction.deferReply({ ephemeral: true });
            const result = await findUserKey(user.id);
            if (!result) return interaction.editReply('❌ Lisans yok.');
         
            let { key, parts } = result;
            while (parts.length < 8) parts.push("0");
            const isVIP = parts[7] === 'VIP';
            const LIMITS = {
                PAUSE: isVIP ? CONFIG.VIP_PAUSE_LIMIT : CONFIG.DEFAULT_PAUSE_LIMIT,
                RESET: isVIP ? CONFIG.VIP_RESET_LIMIT : CONFIG.DEFAULT_RESET_LIMIT
            };
            let [durum, pause, reset] = [parts[2], parseInt(parts[5]), parseInt(parts[6])];
            
            if (customId === 'toggle') {
                if (durum === 'aktif') {
                    if (!isVIP && pause >= LIMITS.PAUSE) return interaction.editReply('❌ Limit doldu.');
                    durum = 'pasif'; pause++;
                } else durum = 'aktif';
                parts[2] = durum; parts[5] = pause;
            }
            else if (customId === 'reset') {
                if (reset >= LIMITS.RESET) return interaction.editReply('❌ Limit doldu.');
                parts[0] = 'bos'; reset++; parts[6] = reset;
                sendLog(guild, `🔄 **HWID SIFIRLANDI**\n**Kullanıcı:** ${user.tag}\n**Key:** ${key}`);
                interaction.editReply('✅ HWID Sıfırlandı!');
            }
            await firebaseRequest('put', key, parts.join(','));
            return interaction.editReply(createPanelPayload(key, parts));
        }
    } catch (err) {
        console.error("Buton hatası:", err);
    }
}

// =============================================================================
// 9. SELECT MENU HANDLER (ÇİFT CEVAP HATASI GİDERİLDİ)
// =============================================================================
async function handleSelectMenu(interaction) {
    const { customId, values, user, guild } = interaction;
    try {
        if (customId === 'welcomer_toggle') {
            const settingKey = values[0];
            const settings = await getWelcomeSettings(guild.id);
            settings[settingKey] = !settings[settingKey];
            await setWelcomeSettings(guild.id, settings);
            return interaction.reply({ content: `✅ **${settingKey}** ayarı ${settings[settingKey] ? 'açıldı' : 'kapatıldı'}!`, ephemeral: true });
        }
        
        if (customId === 'ticket_create_menu') {
            const category = values[0];
            if (isMaintenanceEnabled && !await checkPermission(user.id))
                return interaction.reply({ content: '🔒 Bakımdayız.', ephemeral: true });
            
            await interaction.deferReply({ ephemeral: true });
         
            const ticketNum = await getNextTicketNumber();
            const typePrefix = category.split('_')[1];
            const channelName = `${typePrefix}-${ticketNum}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
            const ticketChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: interaction.channel.parentId,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: CONFIG.MASTER_VIEW_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
                ]
            });
            
            const controlEmbed = new EmbedBuilder()
                .setTitle('👋 Profesyonel Destek Talebiniz Alındı')
                .setDescription(`Merhaba **${user}**,\n\nKategori: **${typePrefix.toUpperCase()}**\nEkibimiz kısa sürede yardımcı olacak.\nLütfen sorununuzu detaylı anlatın.`)
                .setColor(CONFIG.GOLD_COLOR)
                .setThumbnail(user.displayAvatarURL());
            const controlRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Kapat & Arşivle').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
                new ButtonBuilder().setCustomId('claim_ticket').setLabel('Yetkili: Sahiplen').setStyle(ButtonStyle.Success).setEmoji('🙋‍♂️')
            );
            
            if (category === 'cat_buy') {
                const productMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_product')
                    .setPlaceholder('📦 Hangi ürünü almak istiyorsunuz?')
                    .addOptions(
                        { label: 'PC UID Bypass', value: 'prod_uid', emoji: '🛡️' },
                        { label: 'PC External', value: 'prod_external', emoji: '🔮' },
                        { label: 'PC Mod Menü', value: 'prod_modmenu', emoji: '👑' },
                        { label: 'PC Fake Lag', value: 'prod_fakelag', emoji: '💨' },
                        { label: 'Android Fake Lag', value: 'prod_android', emoji: '📱' }
                    );
             
                await ticketChannel.send({
                    content: `${user} | <@&${CONFIG.SUPPORT_ROLE_ID}>`,
                    embeds: [controlEmbed],
                    components: [new ActionRowBuilder().addComponents(productMenu), controlRow]
                });
            } else {
                await ticketChannel.send({
                    content: `${user} | <@&${CONFIG.SUPPORT_ROLE_ID}>`,
                    embeds: [controlEmbed],
                    components: [controlRow]
                });
            }
            return interaction.editReply(`✅ Ticket açıldı: ${ticketChannel}`);
        }
        
        if (customId === 'faq_select') {
            const val = values[0];
            let title, desc;
            switch(val) {
                case 'faq_ban': title = '🛡️ Ban Riski Var Mı?'; desc = 'Yazılımlarımız %100 External ve güvenlidir. Ancak her hilede olduğu gibi düşük de olsa risk vardır. Legit (belli etmeden) oynarsanız sorun yaşamazsınız.'; break;
                case 'faq_buy': title = '💳 Nasıl Satın Alırım?'; desc = 'Satın almak için `#ticket-kur` kanalından "Satın Alım" ticketı oluşturun. IBAN, Papara ve Kripto kabul ediyoruz.'; break;
                case 'faq_refund': title = '🔄 İade Var Mı?'; desc = 'Dijital ürünlerde (Key teslim edildikten sonra) iade mümkün değildir. Ancak ürün bizden kaynaklı çalışmazsa iade yapılır.'; break;
                case 'faq_support': title = '⏰ Destek Saatleri'; desc = 'Otomatik sistemimiz 7/24 aktiftir. Yetkili ekibimiz genellikle 10:00 - 02:00 saatleri arasında canlı destek verir.'; break;
                case 'faq_install': title = '🛠️ Kurulum Zor Mu?'; desc = 'Hayır! Tek tıkla çalışan Loader sistemimiz mevcuttur. Ayrıca satın alım sonrası kurulum videosu iletmekteyiz.'; break;
            }
            return interaction.reply({
                embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(CONFIG.SUCCESS_COLOR)],
                ephemeral: true
            });
        }
        
        if (customId === 'select_product') {
            await interaction.deferReply({ ephemeral: true });
            const val = values[0];
            let title = "", priceInfo = "";
            switch(val) {
                case 'prod_uid': title = "🛡️ PC UID BYPASS"; priceInfo = "**📆 Haftalık:** 600₺\n**🗓️ Aylık:** 1500₺\n\n*Ban riskini ortadan kaldıran bypass.*"; break;
                case 'prod_external': title = "🔮 PC EXTERNAL"; priceInfo = "**📆 Haftalık:** 600₺\n**🗓️ Aylık:** 1500₺\n\n*Güvenli external yazılım.*"; break;
                case 'prod_modmenu': title = "👑 PC MOD MENÜ"; priceInfo = "**📆 Haftalık:** 700₺\n**🗓️ Aylık:** 2000₺\n\n*Full özellikli mod menü.*"; break;
                case 'prod_fakelag': title = "💨 PC FAKE Lag"; priceInfo = "**📆 Haftalık:** 200₺\n**♾️ SINIRSIZ:** 500₺\n\n*Laglı görünme sistemi.*"; break;
                case 'prod_android': title = "📱 ANDROID FAKE LAG"; priceInfo = "**🗓️ Aylık:** 800₺\n\n*Mobil özel.*"; break;
            }
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(`${priceInfo}\n\n▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬\n💳 **SATIN ALMAK İÇİN:**\nLütfen bu kanala **IBAN** veya **PAPARA** yazarak ödeme bilgilerini isteyiniz.`)
                .setColor(CONFIG.EMBED_COLOR)
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/2543/2543369.png');
            return interaction.editReply({ embeds: [embed] });
        }
        
        if (customId === 'delete_key' || customId.startsWith('add_right_')) {
            if (!await checkPermission(interaction.user.id))
                return interaction.reply({ content: '⛔ Yetkisiz.', ephemeral: true });
             
            const key = values[0];
            if (customId === 'delete_key') {
                await interaction.deferUpdate();
                await firebaseRequest('delete', key);
                return interaction.editReply({ content: `✅ **${key}** silindi!`, components: [] });
            } else {
                await interaction.deferUpdate();
                const [_, __, type, amountStr] = customId.split('_');
                const amount = parseInt(amountStr);
                const raw = await firebaseRequest('get', key);
                if (raw) {
                    let p = raw.split(',');
                    while (p.length < 8) p.push("0");
                    let idx = type === 'hwid' ? 6 : 5;
                    p[idx] = Math.max(0, parseInt(p[idx]) - amount);
                    await firebaseRequest('put', key, p.join(','));
                    sendLog(interaction.guild, `➕ **HAK EKLENDİ**\n**Admin:** ${user.tag}\n**Key:** ${key}\n**Miktar:** +${amount} ${type}`);
                    return interaction.editReply({ content: `✅ **${key}** için +${amount} **${type.toUpperCase()}** hakkı eklendi.`, components: [] });
                } else return interaction.editReply({ content: '❌ Key bulunamadı.', components: [] });
            }
        }
    } catch (err) {
        console.error("Select Menu Hatası:", err);
    }
}

// =============================================================================
// 10. CRASH ENGELLEYİCİ - ZIRH SİSTEMİ (BOTUN ASLA KAPANMAYACAK)
// =============================================================================
process.on('unhandledRejection', error => {
    console.error('⚠️ [CRASH ÖNLENDİ] Unhandled Rejection yakalandı:', error.message || error);
});

process.on('uncaughtException', error => {
    console.error('🚨 [CRASH ÖNLENDİ] Uncaught Exception yakalandı:', error.message || error);
});

client.login(process.env.TOKEN);