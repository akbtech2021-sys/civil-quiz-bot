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
const questions = JSON.parse(fs.readFileSync('questions.json', 'utf8'));

const userData = new Map();

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

function sendQuestion(userId) {
  const user = userData.get(userId);
  const q = user.testQuestions[user.current];

  bot.telegram.sendQuiz(user.chatId, q.question, q.options, {
    correct_option_id: q.correct_option,
    explanation: q.explanation,
    is_anonymous: false,
  });
}

function startTest(ctx, count) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  if (questions.length < count) {
    ctx.reply('Not enough questions in database.');
    return;
  }

  const shuffled = shuffleArray([...questions]);
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
    ctx.reply('Welcome to Civil Engineering Quiz Bot\n\nChoose Test Mode:\n/test20\n/test30\n/test50\n/test100');
  });

  bot.command('test20', (ctx) => startTest(ctx, 20));
  bot.command('test30', (ctx) => startTest(ctx, 30));
  bot.command('test50', (ctx) => startTest(ctx, 50));
  bot.command('test100', (ctx) => startTest(ctx, 100));

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
