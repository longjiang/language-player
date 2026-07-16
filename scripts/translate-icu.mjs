#!/usr/bin/env node
/**
 * Manually translate the 5 ICU plural strings for all non-English locales.
 * ICU keywords (one, other, plural, #) MUST be preserved exactly.
 */
import { readFileSync, writeFileSync } from 'fs';

function csvParseLine(line) {
  const fields = []; let curr = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuotes && line[i + 1] === '"') { curr += '"'; i++; } else inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { fields.push(curr); curr = ''; }
    else curr += ch;
  }
  fields.push(curr); return fields;
}

function csvEscape(val) {
  if (typeof val !== 'string') return String(val ?? '');
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

// ── Manual ICU translations ──────────────────
// Format: translations[locale] = { key: translation }
// Preserve ALL { } blocks exactly, translate only surrounding text.

const T = {
  'zh-Hans': {
    'msg.days_remaining': '剩余 {n} 天',
    'msg.more_queued': '还有 {count} 个单词将在明天加入复习。',
    'msg.new_cards_available': '今天有 {count} 张新卡片可用（每日上限 {limit} 张）。',
    'msg.no_cards_due_desc': '您的 {deck} 卡组中有 {total} 张卡片，但没有需要复习的。每天会有新卡片可供学习。',
    'msg.result_count': '{count, plural, other {# 个结果}}',
  },
  'zh-Hant': {
    'msg.days_remaining': '剩餘 {n} 天',
    'msg.more_queued': '還有 {count} 個單字排入明天的批次。',
    'msg.new_cards_available': '今天有 {count} 張新卡片可用（每日上限 {limit} 張）。',
    'msg.no_cards_due_desc': '您的 {deck} 牌組中有 {total} 張卡片，但目前沒有需要複習的。新卡片每天都會解鎖。',
    'msg.result_count': '{count, plural, other {# 筆結果}}',
  },
  af: {
    'msg.days_remaining': '{n} {n, plural, one {dag} other {dae}} oor',
    'msg.more_queued': '{count, plural, one {nog \'n woord in die tou} other {nog woorde in die tou}} vir môre se bondel.',
    'msg.new_cards_available': '{count, plural, one {nuwe kaart beskikbaar} other {nuwe kaarte beskikbaar}} vandag (van {limit}/dag).',
    'msg.no_cards_due_desc': 'Jy het {total} {total, plural, one {kaart} other {kaarte}} in jou {deck}-stel, maar niks is nog vir hersiening verskuldig nie. Nuwe kaarte word elke dag beskikbaar.',
    'msg.result_count': '{count, plural, one {# resultaat} other {# resultate}}',
  },
  ar: {
    // already correct, keep as-is
    'msg.days_remaining': 'متبقي {n} أيام',
    'msg.more_queued': 'تمت جدولة {count} كلمات إضافية لدفعة الغد.',
    'msg.new_cards_available': '{count} بطاقات جديدة متاحة اليوم (من {limit}/يوم).',
    'msg.no_cards_due_desc': 'لديك {total} بطاقة في مجموعة {deck}، لكن لا توجد بطاقات مستحقة للمراجعة حاليًا. البطاقات الجديدة تصبح متاحة يوميًا.',
    'msg.result_count': '{count, plural, one {# نتيجة} other {# نتائج}}',
  },
  ca: {
    'msg.days_remaining': '{n} {n, plural, one {dia} other {dies}} restants',
    'msg.more_queued': '{count, plural, one {una paraula més a la cua} other {més paraules a la cua}} per al lot de demà.',
    'msg.new_cards_available': '{count, plural, one {nova targeta disponible} other {noves targetes disponibles}} avui (de {limit}/dia).',
    'msg.no_cards_due_desc': 'Tens {total} {total, plural, one {targeta} other {targetes}} a la teva baralla {deck}, però cap està pendent de revisió. Les targetes noves estan disponibles cada dia.',
    'msg.result_count': '{count, plural, one {# resultat} other {# resultats}}',
  },
  de: {
    'msg.days_remaining': '{n} {n, plural, one {Tag} other {Tage}} verbleibend',
    'msg.more_queued': '{count, plural, one {weiteres Wort in Warteschlange} other {weitere Wörter in Warteschlange}} für den morgigen Stapel.',
    'msg.new_cards_available': '{count, plural, one {neue Karte verfügbar} other {neue Karten verfügbar}} heute (von {limit}/Tag).',
    'msg.no_cards_due_desc': 'Du hast {total} {total, plural, one {Karte} other {Karten}} in deinem {deck}-Stapel, aber keine sind zur Wiederholung fällig. Neue Karten werden jeden Tag verfügbar.',
    'msg.result_count': '{count, plural, one {# Ergebnis} other {# Ergebnisse}}',
  },
  el: {
    'msg.days_remaining': '{n} {n, plural, one {ημέρα} other {ημέρες}} απομένουν',
    'msg.more_queued': '{count, plural, one {ακόμα μία λέξη στην ουρά} other {ακόμα λέξεις στην ουρά}} για την αυριανή παρτίδα.',
    'msg.new_cards_available': '{count, plural, one {νέα κάρτα διαθέσιμη} other {νέες κάρτες διαθέσιμες}} σήμερα (από {limit}/ημέρα).',
    'msg.no_cards_due_desc': 'Έχεις {total} {total, plural, one {κάρτα} other {κάρτες}} στην τράπουλα {deck}, αλλά καμία δεν χρειάζεται επανάληψη ακόμα. Νέες κάρτες γίνονται διαθέσιμες κάθε μέρα.',
    'msg.result_count': '{count, plural, one {# αποτέλεσμα} other {# αποτελέσματα}}',
  },
  es: {
    'msg.days_remaining': '{n} {n, plural, one {día} other {días}} restantes',
    'msg.more_queued': '{count, plural, one {una palabra más en cola} other {más palabras en cola}} para el lote de mañana.',
    'msg.new_cards_available': '{count, plural, one {nueva tarjeta disponible} other {nuevas tarjetas disponibles}} hoy (de {limit}/día).',
    'msg.no_cards_due_desc': 'Tienes {total} {total, plural, one {tarjeta} other {tarjetas}} en tu mazo {deck}, pero ninguna está pendiente de revisión. Hay nuevas tarjetas disponibles cada día.',
    'msg.result_count': '{count, plural, one {# resultado} other {# resultados}}',
  },
  fi: {
    'msg.days_remaining': '{n} {n, plural, one {päivä} other {päivää}} jäljellä',
    'msg.more_queued': '{count, plural, one {vielä yksi sana jonossa} other {vielä sanoja jonossa}} huomisen erään.',
    'msg.new_cards_available': '{count, plural, one {uusi kortti saatavilla} other {uutta korttia saatavilla}} tänään (enintään {limit}/päivä).',
    'msg.no_cards_due_desc': 'Sinulla on {total} {total, plural, one {kortti} other {korttia}} {deck}-pakassasi, mutta yhtään ei ole vielä kertauksessa. Uusia kortteja tulee saataville joka päivä.',
    'msg.result_count': '{count, plural, one {# tulos} other {# tulosta}}',
  },
  fr: {
    'msg.days_remaining': '{n} {n, plural, one {jour} other {jours}} restants',
    'msg.more_queued': '{count, plural, one {mot supplémentaire en file} other {mots supplémentaires en file}} pour le lot de demain.',
    'msg.new_cards_available': '{count, plural, one {nouvelle carte disponible} other {nouvelles cartes disponibles}} aujourd\'hui (sur {limit}/jour).',
    'msg.no_cards_due_desc': 'Vous avez {total} {total, plural, one {carte} other {cartes}} dans votre paquet {deck}, mais aucune n\'est à réviser pour l\'instant. De nouvelles cartes sont disponibles chaque jour.',
    'msg.result_count': '{count, plural, one {# résultat} other {# résultats}}',
  },
  ga: {
    'msg.days_remaining': '{n} {n, plural, one {lá} other {laethanta}} fágtha',
    'msg.more_queued': '{count, plural, one {focal eile sa scuaine} other {focail eile sa scuaine}} do bhaisc an lae amáraigh.',
    'msg.new_cards_available': '{count, plural, one {cárta nua ar fáil} other {cártaí nua ar fáil}} inniu (as {limit}/lá).',
    'msg.no_cards_due_desc': 'Tá {total} {total, plural, one {cárta} other {cártaí}} i do phaca {deck}, ach níl aon cheann dlite le hathbhreithniú go fóill. Bíonn cártaí nua ar fáil gach lá.',
    'msg.result_count': '{count, plural, one {# toradh} other {# torthaí}}',
  },
  hi: {
    'msg.days_remaining': '{n} {n, plural, one {दिन} other {दिन}} शेष',
    'msg.more_queued': '{count, plural, one {एक और शब्द कतार में} other {और शब्द कतार में}} कल के बैच के लिए।',
    'msg.new_cards_available': '{count, plural, one {नया कार्ड उपलब्ध} other {नए कार्ड उपलब्ध}} आज ({limit}/दिन में से)।',
    'msg.no_cards_due_desc': 'आपके {deck} डेक में {total} {total, plural, one {कार्ड} other {कार्ड}} हैं, लेकिन अभी समीक्षा के लिए कोई बाकी नहीं है। हर दिन नए कार्ड उपलब्ध होते हैं।',
    'msg.result_count': '{count, plural, one {# परिणाम} other {# परिणाम}}',
  },
  hr: {
    'msg.days_remaining': '{n} {n, plural, one {dan} few {dana} other {dana}} preostalo',
    'msg.more_queued': '{count, plural, one {još jedna riječ u redu} few {još riječi u redu} other {još riječi u redu}} za sutrašnju grupu.',
    'msg.new_cards_available': '{count, plural, one {nova kartica dostupna} few {nove kartice dostupne} other {novih kartica dostupno}} danas (od {limit}/dan).',
    'msg.no_cards_due_desc': 'Imaš {total} {total, plural, one {karticu} few {kartice} other {kartica}} u svom {deck} špilu, ali nijedna nije na redu za ponavljanje. Nove kartice postaju dostupne svaki dan.',
    'msg.result_count': '{count, plural, one {# rezultat} few {# rezultata} other {# rezultata}}',
  },
  hu: {
    'msg.days_remaining': '{n} {n, plural, one {nap} other {nap}} van hátra',
    'msg.more_queued': '{count, plural, one {még egy szó a sorban} other {további szavak a sorban}} a holnapi adaghoz.',
    'msg.new_cards_available': '{count, plural, one {új kártya érhető el} other {új kártya érhető el}} ma (legfeljebb {limit}/nap).',
    'msg.no_cards_due_desc': '{total} {total, plural, one {kártyád} other {kártyád}} van a(z) {deck} pakliban, de egyiket sem kell még átismételni. Minden nap új kártyák válnak elérhetővé.',
    'msg.result_count': '{count, plural, one {# találat} other {# találat}}',
  },
  id: {
    'msg.days_remaining': '{n} {n, plural, other {hari}} tersisa',
    'msg.more_queued': '{count, plural, other {kata lagi dalam antrean}} untuk batch besok.',
    'msg.new_cards_available': '{count, plural, other {kartu baru tersedia}} hari ini (dari {limit}/hari).',
    'msg.no_cards_due_desc': 'Kamu punya {total} {total, plural, other {kartu}} di dek {deck}, tapi belum ada yang waktunya diulang. Kartu baru tersedia setiap hari.',
    'msg.result_count': '{count, plural, other {# hasil}}',
  },
  it: {
    'msg.days_remaining': '{n} {n, plural, one {giorno} other {giorni}} rimanenti',
    'msg.more_queued': '{count, plural, one {altra parola in coda} other {altre parole in coda}} per il lotto di domani.',
    'msg.new_cards_available': '{count, plural, one {nuova scheda disponibile} other {nuove schede disponibili}} oggi (di {limit}/giorno).',
    'msg.no_cards_due_desc': 'Hai {total} {total, plural, one {scheda} other {schede}} nel tuo mazzo {deck}, ma nessuna è in scadenza per il ripasso. Nuove schede sono disponibili ogni giorno.',
    'msg.result_count': '{count, plural, one {# risultato} other {# risultati}}',
  },
  ja: {
    'msg.days_remaining': '残り {n} 日',
    'msg.more_queued': '明日のバッチにあと {count} 語がキューに入っています。',
    'msg.new_cards_available': '今日は {count} 枚の新しいカードが利用可能です（1日 {limit} 枚まで）。',
    'msg.no_cards_due_desc': '{deck} デッキに {total} 枚のカードがありますが、復習が必要なカードはまだありません。新しいカードは毎日利用可能になります。',
    'msg.result_count': '{count, plural, other {# 件の結果}}',
  },
  ko: {
    'msg.days_remaining': '{n}일 남음',
    'msg.more_queued': '내일 배치를 위해 {count}개의 단어가 대기열에 추가되었습니다.',
    'msg.new_cards_available': '오늘 {count}개의 새 카드를 사용할 수 있습니다 (하루 {limit}개까지).',
    'msg.no_cards_due_desc': '{deck} 덱에 {total}장의 카드가 있지만, 아직 복습할 카드가 없습니다. 새 카드는 매일 제공됩니다.',
    'msg.result_count': '{count, plural, other {#개의 결과}}',
  },
  nl: {
    'msg.days_remaining': '{n} {n, plural, one {dag} other {dagen}} resterend',
    'msg.more_queued': '{count, plural, one {nog een woord in de wachtrij} other {nog woorden in de wachtrij}} voor de batch van morgen.',
    'msg.new_cards_available': '{count, plural, one {nieuwe kaart beschikbaar} other {nieuwe kaarten beschikbaar}} vandaag (van {limit}/dag).',
    'msg.no_cards_due_desc': 'Je hebt {total} {total, plural, one {kaart} other {kaarten}} in je {deck}-set, maar geen enkele is aan herhaling toe. Nieuwe kaarten zijn elke dag beschikbaar.',
    'msg.result_count': '{count, plural, one {# resultaat} other {# resultaten}}',
  },
  no: {
    'msg.days_remaining': '{n} {n, plural, one {dag} other {dager}} igjen',
    'msg.more_queued': '{count, plural, one {ett ord til i køen} other {flere ord i køen}} for morgendagens batch.',
    'msg.new_cards_available': '{count, plural, one {nytt kort tilgjengelig} other {nye kort tilgjengelige}} i dag (av {limit}/dag).',
    'msg.no_cards_due_desc': 'Du har {total} {total, plural, one {kort} other {kort}} i {deck}-stokken din, men ingen er forfalt til gjennomgang ennå. Nye kort blir tilgjengelige hver dag.',
    'msg.result_count': '{count, plural, one {# resultat} other {# resultater}}',
  },
  pl: {
    'msg.days_remaining': '{n} {n, plural, one {dzień} few {dni} other {dni}} pozostało',
    'msg.more_queued': '{count, plural, one {jeszcze jedno słowo w kolejce} few {jeszcze słowa w kolejce} other {jeszcze słów w kolejce}} na jutrzejszą partię.',
    'msg.new_cards_available': '{count, plural, one {nowa karta dostępna} few {nowe karty dostępne} other {nowych kart dostępnych}} dzisiaj (z {limit}/dzień).',
    'msg.no_cards_due_desc': 'Masz {total} {total, plural, one {kartę} few {karty} other {kart}} w talii {deck}, ale żadna nie wymaga jeszcze powtórki. Nowe karty są dostępne każdego dnia.',
    'msg.result_count': '{count, plural, one {# wynik} few {# wyniki} other {# wyników}}',
  },
  pt: {
    'msg.days_remaining': '{n} {n, plural, one {dia} other {dias}} restantes',
    'msg.more_queued': '{count, plural, one {mais uma palavra na fila} other {mais palavras na fila}} para o lote de amanhã.',
    'msg.new_cards_available': '{count, plural, one {novo cartão disponível} other {novos cartões disponíveis}} hoje (de {limit}/dia).',
    'msg.no_cards_due_desc': 'Você tem {total} {total, plural, one {cartão} other {cartões}} no seu baralho {deck}, mas nenhum está pendente de revisão. Novos cartões ficam disponíveis a cada dia.',
    'msg.result_count': '{count, plural, one {# resultado} other {# resultados}}',
  },
  ro: {
    'msg.days_remaining': '{n} {n, plural, one {zi} other {zile}} rămase',
    'msg.more_queued': '{count, plural, one {încă un cuvânt în coadă} other {mai multe cuvinte în coadă}} pentru lotul de mâine.',
    'msg.new_cards_available': '{count, plural, one {un card nou disponibil} other {carduri noi disponibile}} astăzi (din {limit}/zi).',
    'msg.no_cards_due_desc': 'Ai {total} {total, plural, one {card} other {carduri}} în pachetul {deck}, dar niciunul nu este programat pentru recapitulare. Carduri noi devin disponibile în fiecare zi.',
    'msg.result_count': '{count, plural, one {# rezultat} other {# rezultate}}',
  },
  ru: {
    'msg.days_remaining': '{n} {n, plural, one {день} few {дня} other {дней}} осталось',
    'msg.more_queued': '{count, plural, one {ещё одно слово в очереди} few {ещё слова в очереди} other {ещё слов в очереди}} на завтрашнюю партию.',
    'msg.new_cards_available': '{count, plural, one {новая карточка доступна} few {новые карточки доступны} other {новых карточек доступно}} сегодня (из {limit}/день).',
    'msg.no_cards_due_desc': 'У вас {total} {total, plural, one {карточка} few {карточки} other {карточек}} в колоде {deck}, но пока нет карточек для повторения. Новые карточки становятся доступны каждый день.',
    'msg.result_count': '{count, plural, one {# результат} few {# результата} other {# результатов}}',
  },
  sr: {
    'msg.days_remaining': '{n} {n, plural, one {dan} few {dana} other {dana}} preostalo',
    'msg.more_queued': '{count, plural, one {još jedna reč u redu} few {još reči u redu} other {još reči u redu}} za sutrašnju grupu.',
    'msg.new_cards_available': '{count, plural, one {nova kartica dostupna} few {nove kartice dostupne} other {novih kartica dostupno}} danas (od {limit}/dan).',
    'msg.no_cards_due_desc': 'Imaš {total} {total, plural, one {karticu} few {kartice} other {kartica}} u svom {deck} špilu, ali nijedna nije na redu za ponavljanje. Nove kartice postaju dostupne svaki dan.',
    'msg.result_count': '{count, plural, one {# rezultat} few {# rezultata} other {# rezultata}}',
  },
  sv: {
    'msg.days_remaining': '{n} {n, plural, one {dag} other {dagar}} kvar',
    'msg.more_queued': '{count, plural, one {ytterligare ett ord i kö} other {ytterligare ord i kö}} för morgondagens omgång.',
    'msg.new_cards_available': '{count, plural, one {nytt kort tillgängligt} other {nya kort tillgängliga}} idag (av {limit}/dag).',
    'msg.no_cards_due_desc': 'Du har {total} {total, plural, one {kort} other {kort}} i din {deck}-lek, men inga är förfallna för repetition än. Nya kort blir tillgängliga varje dag.',
    'msg.result_count': '{count, plural, one {# resultat} other {# resultat}}',
  },
  sw: {
    'msg.days_remaining': '{n} {n, plural, one {siku} other {siku}} zimesalia',
    'msg.more_queued': '{count, plural, one {neno moja zaidi foleni} other {maneno zaidi foleni}} kwa kundi la kesho.',
    'msg.new_cards_available': '{count, plural, one {kadi mpya inapatikana} other {kadi mpya zinapatikana}} leo (kati ya {limit}/siku).',
    'msg.no_cards_due_desc': 'Una {total} {total, plural, one {kadi} other {kadi}} kwenye staha yako ya {deck}, lakini hakuna inayostahili kupitiwa bado. Kadi mpya zinapatikana kila siku.',
    'msg.result_count': '{count, plural, one {# tokeo} other {# matokeo}}',
  },
  th: {
    'msg.days_remaining': 'เหลืออีก {n} วัน',
    'msg.more_queued': 'มีคำอีก {count} คำในคิวสำหรับชุดของวันพรุ่งนี้',
    'msg.new_cards_available': 'มีการ์ดใหม่ {count} ใบวันนี้ (จาก {limit} ใบ/วัน)',
    'msg.no_cards_due_desc': 'คุณมีการ์ด {total} ใบในสำรับ {deck} แต่ยังไม่มีการ์ดที่ถึงกำหนดทบทวน การ์ดใหม่จะพร้อมใช้งานทุกวัน',
    'msg.result_count': '{count, plural, other {# ผลลัพธ์}}',
  },
  tr: {
    'msg.days_remaining': '{n} {n, plural, one {gün} other {gün}} kaldı',
    'msg.more_queued': '{count, plural, one {bir kelime daha sırada} other {daha fazla kelime sırada}} yarınki parti için.',
    'msg.new_cards_available': '{count, plural, one {yeni kart mevcut} other {yeni kart mevcut}} bugün (günde {limit} adet).',
    'msg.no_cards_due_desc': '{deck} destende {total} {total, plural, one {kartın} other {kartın}} var, ancak henüz gözden geçirilmesi gereken yok. Her gün yeni kartlar kullanılabilir hale gelir.',
    'msg.result_count': '{count, plural, one {# sonuç} other {# sonuç}}',
  },
  vi: {
    'msg.days_remaining': 'Còn {n} ngày',
    'msg.more_queued': 'Còn {count} từ nữa trong hàng đợi cho đợt ngày mai.',
    'msg.new_cards_available': 'Có {count} thẻ mới hôm nay (tối đa {limit}/ngày).',
    'msg.no_cards_due_desc': 'Bạn có {total} thẻ trong bộ {deck}, nhưng chưa có thẻ nào cần ôn tập. Thẻ mới sẽ có sẵn mỗi ngày.',
    'msg.result_count': '{count, plural, other {# kết quả}}',
  },
};

// ── Apply to CSV ─────────────────────────────
const CSV_PATH = 'translations.csv';
const csv = readFileSync(CSV_PATH, 'utf-8').trim().split('\n');
const header = csvParseLine(csv[0]);

// Build locale → column index map
const colMap = {};
for (let i = 1; i < header.length; i++) {
  colMap[header[i]] = i;
}

const icuKeys = Object.keys(T.en || T['zh-Hans']);
// Get actual keys from first non-en entry
const sampleLocale = Object.keys(T).find(l => l !== 'en');
const targetKeys = Object.keys(T[sampleLocale]);

console.log(`Updating ${targetKeys.length} ICU keys for ${Object.keys(T).length} locales...\n`);

let updated = 0;
for (let rowIdx = 1; rowIdx < csv.length; rowIdx++) {
  const fields = csvParseLine(csv[rowIdx]);
  const key = fields[0];

  for (const loc of Object.keys(T)) {
    if (!T[loc][key]) continue;
    const colIdx = colMap[loc];
    if (colIdx === undefined) continue;

    const newVal = T[loc][key];
    const oldVal = fields[colIdx];
    if (oldVal !== newVal) {
      fields[colIdx] = newVal;
      updated++;
    }
  }
  // Rebuild the CSV line with proper escaping
  csv[rowIdx] = fields.map(csvEscape).join(',');
}

writeFileSync(CSV_PATH, csv.join('\n') + '\n');
console.log(`✓ Updated ${updated} cells in ${CSV_PATH}`);
console.log('Run: node scripts/sync-translations.mjs csv-to-json');
