const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const token = process.env.TOKEN || "8676220690:AAF_8o4CuZOMfxWF1DdSOO0yGz_sC2ukeqE";
const bot = new TelegramBot(token, { polling: true });

// Load 1000 Questions JSON
const questions = JSON.parse(fs.readFileSync('questions.json', 'utf8'));

let userData = {};

function shuffleArray(array) {
    return array.sort(() => Math.random() - 0.5);
}

function sendQuestion(chatId, userId) {
    const user = userData[userId];
    const q = user.testQuestions[user.current];

    bot.sendPoll(chatId, q.question, q.options, {
        type: 'quiz',
        correct_option_id: q.correct_option,
        is_anonymous: false,
        explanation: q.explanation
    });
}

function startTest(msg, count) {
    const userId = msg.from.id;

    if (questions.length < count) {
        bot.sendMessage(msg.chat.id, "Not enough questions in database.");
        return;
    }

    const shuffled = shuffleArray([...questions]);
    const selectedQuestions = shuffled.slice(0, count);

    userData[userId] = {
        current: 0,
        score: 0,
        wrong: 0,
        total: count,
        testQuestions: selectedQuestions
    };

    bot.sendMessage(msg.chat.id, `🚀 ${count} Question Test Started!\n\nNegative Marking: -0.25`);
    sendQuestion(msg.chat.id, userId);
}

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        `👋 Welcome to Civil Engineering Quiz Bot

Choose Test Mode:

/test20
/test30
/test50
/test100`
    );
});

bot.onText(/\/test20/, (msg) => startTest(msg, 20));
bot.onText(/\/test30/, (msg) => startTest(msg, 30));
bot.onText(/\/test50/, (msg) => startTest(msg, 50));
bot.onText(/\/test100/, (msg) => startTest(msg, 100));

bot.on('poll_answer', (answer) => {
    const userId = answer.user.id;
    const selected = answer.option_ids[0];

    if (!userData[userId]) return;

    const user = userData[userId];
    const correctAnswer = user.testQuestions[user.current].correct_option;

    if (selected === correctAnswer) {
        user.score++;
    } else {
        user.wrong++;
    }

    user.current++;

    if (user.current < user.total) {
        sendQuestion(userId, userId);
    } else {
        const negative = user.wrong * 0.25;
        const finalScore = user.score - negative;

        bot.sendMessage(
            userId,
            `🎉 Test Finished!

📊 Total Questions: ${user.total}
✅ Correct: ${user.score}
❌ Wrong: ${user.wrong}
➖ Negative Marks: ${negative}

🏆 Final Score: ${finalScore.toFixed(2)} / ${user.total}`
        );

        delete userData[userId];
    }
});

console.log("🔥 Civil Engineering Multi-Test Bot Running...");