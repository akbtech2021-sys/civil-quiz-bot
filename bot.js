const { Telegraf } = require('telegraf');
const fs = require('fs');
const express = require('express');

const token = process.env.TOKEN;
const skipBot = process.env.SKIP_BOT === 'true';

if (!token && !skipBot) {
  console.error('Missing TOKEN environment variable. Set TOKEN and restart.');
  process.exit(1);
}

const bot = skipBot ? null : new Telegraf(token);

function loadQuestions() {
  return JSON.parse(fs.readFileSync('questions.json', 'utf8'));
}

let questions = loadQuestions();

// Subject slices are positional in questions.json based on the provided counts
const subjectConfig = [
  ['mech', 'Engineering Mechanics', 150],
  ['struct', 'Structural Analysis', 150],
  ['rcc', 'RCC', 150],
  ['geo', 'Geotechnical', 150],
  ['env', 'Environmental', 200],
  ['fluid', 'Fluid Mechanics', 200],
  ['hydro', 'Hydrology + Irrigation', 150],
  ['trans', 'Transportation', 150],
  ['cp', 'Construction Planning', 100],
  ['math', 'Engineering Mathematics', 100],
];

const subjectIndex = subjectConfig.map(([key, name, count], idx, arr) => {
  const start = arr.slice(0, idx).reduce((sum, [, , c]) => sum + c, 0);
  return { key, name, count, start, end: start + count };
});

function getSubjectSlice(key) {
  const subject = subjectIndex.find((s) => s.key === key);
  if (!subject) return null;
  return {
    meta: subject,
    pool: questions.slice(subject.start, subject.end),
  };
}

const userData = new Map();

// Auto-reload questions every 15 days to pick up updates
const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
setInterval(() => {
  try {
    questions = loadQuestions();
    console.log('Questions reloaded from disk (15-day refresh).');
  } catch (err) {
    console.error('Failed to reload questions:', err.message);
  }
}, FIFTEEN_DAYS_MS);

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

function shuffleOptions(question) {
  const options = [...question.options];
  let correct = question.correct_option;

  // Fisher–Yates shuffle while tracking the correct answer index
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];

    if (i === correct) {
      correct = j;
    } else if (j === correct) {
      correct = i;
    }
  }

  return { options, correct };
}

function sendQuestion(userId) {
  const user = userData.get(userId);
  const q = user.testQuestions[user.current];
  const { options, correct } = shuffleOptions(q);

  bot.telegram.sendQuiz(user.chatId, q.question, options, {
    correct_option_id: correct,
    explanation: q.explanation,
    is_anonymous: false,
  });
}

function startTest(ctx, count, pool = questions) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  if (pool.length < count) {
    ctx.reply('Not enough questions in database for this selection.');
    return;
  }

  const shuffled = shuffleArray([...pool]);
  const selectedQuestions = shuffled.slice(0, count);

  userData.set(userId, {
    chatId,
    current: 0,
    score: 0,
    wrong: 0,
    total: count,
    testQuestions: selectedQuestions,
  });

  ctx.reply(`${count} Question Test Started!\nNegative Marking: -0.25`);
  sendQuestion(userId);
}

if (!skipBot) {
  bot.start((ctx) => {
    ctx.reply(
      'Welcome to Civil Engineering Quiz Bot\n\n' +
      'General Tests: /test20 /test30 /test50 /test100\n' +
      'Subject Tests: /subject <key> <count>\n' +
      'Keys: mech, struct, rcc, geo, env, fluid, hydro, trans, cp, math\n' +
      'Example: /subject mech 20'
    );
  });

  bot.command('test20', (ctx) => startTest(ctx, 20));
  bot.command('test30', (ctx) => startTest(ctx, 30));
  bot.command('test50', (ctx) => startTest(ctx, 50));
  bot.command('test100', (ctx) => startTest(ctx, 100));

  bot.command('subject', (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const key = parts[1]?.toLowerCase();
    const count = parseInt(parts[2], 10) || 20;

    const slice = getSubjectSlice(key);
    if (!slice) {
      ctx.reply('Unknown subject key. Use: mech, struct, rcc, geo, env, fluid, hydro, trans, cp, math');
      return;
    }

    startTest(ctx, count, slice.pool);
  });

  bot.on('poll_answer', (ctx) => {
    const answer = ctx.update.poll_answer;
    const userId = answer.user.id;
    const selected = answer.option_ids[0];

    if (!userData.has(userId)) return;

    const user = userData.get(userId);
    const correctAnswer = user.testQuestions[user.current].correct_option;

    if (selected === correctAnswer) {
      user.score += 1;
    } else {
      user.wrong += 1;
    }

    user.current += 1;

    if (user.current < user.total) {
      sendQuestion(userId);
    } else {
      const negative = user.wrong * 0.25;
      const finalScore = user.score - negative;

      bot.telegram.sendMessage(
        user.chatId,
        `Test Finished!\nTotal Questions: ${user.total}\nCorrect: ${user.score}\nWrong: ${user.wrong}\nNegative Marks: ${negative}\n\nFinal Score: ${finalScore.toFixed(2)} / ${user.total}`
      );

      userData.delete(userId);
    }
  });

  bot.launch();
  console.log('Civil Engineering Multi-Test Bot Running...');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// Minimal web server for uptime pings
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.send('Bot is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
