// commands/quiz.js
// Quiz rapide pour groupes (questions culture générale / fun)
// .quiz  → lance un quiz
// .quiz score → classement (simple en mémoire)

const quizzes = [
    { q: "Quelle est la capitale du Japon ?", a: ["tokyo"], hint: "Commence par T" },
    { q: "Combien de continents y a-t-il ?", a: ["7", "sept"], hint: "Un chiffre" },
    { q: "Qui a peint la Joconde ?", a: ["leonard de vinci", "léonard de vinci", "da vinci", "leonardo da vinci"], hint: "Artiste italien" },
    { q: "Quel animal est le plus rapide sur terre ?", a: ["guepard", "guépard", "cheetah"], hint: "Félin" },
    { q: "En quelle année a eu lieu la Révolution française ?", a: ["1789"], hint: "Fin du 18e siècle" },
    { q: "Quel est le plus grand océan ?", a: ["pacifique", "ocean pacifique", "océan pacifique"], hint: "Entre l'Asie et l'Amérique" },
    { q: "Combien de côtés a un hexagone ?", a: ["6", "six"], hint: "Préfixe hexa" },
    { q: "Qui a inventé l'ampoule électrique ?", a: ["edison", "thomas edison"], hint: "Américain" },
    { q: "Quel pays a gagné le plus de Coupes du Monde de foot ?", a: ["bresil", "brésil", "brazil"], hint: "Amérique du Sud" },
    { q: "Quelle planète est la plus proche du Soleil ?", a: ["mercure"], hint: "Nom d'un dieu romain" },
    { q: "Combien font 12 x 12 ?", a: ["144"], hint: "Carré de 12" },
    { q: "Quel est le symbole chimique de l'or ?", a: ["au"], hint: "2 lettres" },
    { q: "Dans quel pays se trouve le Machu Picchu ?", a: ["perou", "pérou", "peru"], hint: "Amérique du Sud" },
    { q: "Quel fruit est connu pour garder le médecin éloigné ?", a: ["pomme", "apple"], hint: "Rouge ou verte" },
    { q: "Combien de joueurs dans une équipe de foot sur le terrain ?", a: ["11", "onze"], hint: "Nombre impair" }
];

// Mémoire simple par groupe
const activeQuiz = new Map(); // chatId -> { question, answers, hint, start, scores }
const scores = new Map();     // chatId -> Map(senderId -> points)

function normalize(s) {
    return String(s || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
}

function getScores(chatId) {
    if (!scores.has(chatId)) scores.set(chatId, new Map());
    return scores.get(chatId);
}

async function quizCommand(sock, chatId, message, text, senderId) {
    const isGroup = chatId.endsWith('@g.us');
    const args = String(text || '').trim().toLowerCase();

    if (args === 'score' || args === 'scores' || args === 'classement') {
        const sc = getScores(chatId);
        if (sc.size === 0) {
            return sock.sendMessage(chatId, { text: '🏆 Aucun score pour le moment. Lance *.quiz* !' }, { quoted: message });
        }
        const sorted = [...sc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        const lines = sorted.map(([id, pts], i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return `${medal} @${id.split('@')[0]} → *${pts} pts*`;
        });
        return sock.sendMessage(chatId, {
            text: `🏆 *Classement Quiz*\n\n${lines.join('\n')}`,
            mentions: sorted.map(([id]) => id)
        }, { quoted: message });
    }

    // Vérifier s'il y a déjà un quiz en cours
    const current = activeQuiz.get(chatId);
    if (current && Date.now() - current.start < 45000) {
        return sock.sendMessage(chatId, {
            text: `⏳ Un quiz est déjà en cours !\n\n❓ *${current.question}*\n\n💡 Indice : ${current.hint}\nRéponds directement dans le chat.`
        }, { quoted: message });
    }

    // Nouveau quiz
    const item = quizzes[Math.floor(Math.random() * quizzes.length)];
    activeQuiz.set(chatId, {
        question: item.q,
        answers: item.a.map(normalize),
        hint: item.hint,
        start: Date.now(),
        answered: false
    });

    await sock.sendMessage(chatId, {
        text: `🧠 *QUIZ RAPIDE*\n\n❓ ${item.q}\n\n⏱️ Tu as 40 secondes !\n💡 Indice : ${item.hint}\n\nRéponds simplement dans le chat.`
    }, { quoted: message });

    // Timeout auto
    setTimeout(async () => {
        const q = activeQuiz.get(chatId);
        if (q && !q.answered && q.start === activeQuiz.get(chatId)?.start) {
            activeQuiz.delete(chatId);
            try {
                await sock.sendMessage(chatId, {
                    text: `⏰ Temps écoulé !\nLa bonne réponse était : *${item.a[0]}*`
                });
            } catch {}
        }
    }, 40000);
}

/** À appeler depuis le handler de messages pour détecter les réponses */
function checkQuizAnswer(sock, chatId, message, text, senderId) {
    const q = activeQuiz.get(chatId);
    if (!q || q.answered) return false;

    const ans = normalize(text);
    if (!ans) return false;

    const match = q.answers.some(a => ans === a || ans.includes(a) || a.includes(ans));
    if (!match) return false;

    q.answered = true;
    activeQuiz.delete(chatId);

    const sc = getScores(chatId);
    sc.set(senderId, (sc.get(senderId) || 0) + 1);

    sock.sendMessage(chatId, {
        text: `✅ *Bonne réponse !* @${senderId.split('@')[0]}\n+1 point 🎉\n\nVoir le classement : *.quiz score*`,
        mentions: [senderId]
    }, { quoted: message }).catch(() => {});

    return true;
}

module.exports = quizCommand;
module.exports.checkQuizAnswer = checkQuizAnswer;
