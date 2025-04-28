require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');
const bodyParser = require('body-parser');
const validator = require('validator');

const prisma = new PrismaClient();
const app = express();
const PORT = 5000;

app.use(cors());
app.use(bodyParser.json());

const JWT_SECRET = process.env.JWT_SECRET;

app.use('/assets', express.static('public/assets'));

// Middleware d'authentification
const authenticate = async (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: 'Accès refusé' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(400).json({ error: 'Token invalide' });
    }
};

// Inscription
app.post('/auth/signup', async (req, res) => {
    const { nom, prenom, email, password } = req.body;

    // Validation des champs
    if (!nom || !prenom || !email || !password) {
        return res.status(400).json({ error: 'Tous les champs sont requis (nom, prénom, email, mot de passe).' });
    }

    if (!validator.isEmail(email)) {
        return res.status(400).json({ error: 'Email invalide.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: { nom, prenom, email, password: hashedPassword },
        });
        res.json({ message: 'Utilisateur créé' });
    } catch (error) {
        res.status(400).json({ error: 'Email déjà utilisé' });
    }
});

// Connexion
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    const token = jwt.sign({
        userId: user.id,
        email: user.email,
        nom: user.nom,
        prenom: user.prenom
        }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
});

// Réinitialisation du mot de passe
app.post('/auth/recover', async (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: "Email requis" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "Aucun utilisateur trouvé avec cet email" });

    await prisma.passwordReset.deleteMany({
        where: { user_id: user.id }
    });

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.passwordReset.create({
        data: {
            code,
            user_id: user.id,
            expiresAt,
        },
    });

    // Configurer le transporteur nodemailer
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        },
    });

    const mailOptions = {
        from: process.env.MAIL_USER,
        to: email,
        subject: 'Code de réinitialisation de mot de passe',
        text: `Votre code de réinitialisation est : ${code}`,
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: "Code envoyé par email" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Échec de l'envoi de l'email" });
    }
});

// Confirmation du code de réinitialisation
app.post('/auth/reset/confirm', async (req, res) => {
    const { code } = req.body;

    if (!code || code.length !== 4) {
        return res.status(400).json({ error: "Code invalide" });
    }

    const reset = await prisma.passwordReset.findFirst({
        where: {
            code,
            expiresAt: { gt: new Date() },
        },
        include: { user: true },
    });

    if (!reset) {
        return res.status(400).json({ error: "Code expiré ou invalide" });
    }

    res.json({ message: "Code valide", userId: reset.user.id });
});

// Mise à jour du mot de passe
app.post('/auth/reset/update', async (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password || password.length < 6) {
        return res.status(400).json({ error: "Informations invalides" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
    });

    await prisma.passwordReset.deleteMany({ where: { user_id: userId } });

    res.json({ message: "Mot de passe mis à jour avec succès" });
});

// Liste des livres
app.get('/books', async (req, res) => {
    const books = await prisma.book.findMany({ include: { genres: { include: { genre: true } } } });
    res.json(books);
});

// Emprunter un livre
app.post('/books/:bookId/borrow', authenticate, async (req, res) => {
    const { bookId } = req.params;
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book || !book.disponible) return res.status(400).json({ error: 'Livre non disponible' });
    await prisma.emprunt.create({ data: { id_user: req.user.userId, id_book: bookId } });
    await prisma.book.update({ where: { id: bookId }, data: { disponible: false } });
    res.json({ message: 'Livre emprunté avec succès' });
});

// Retourner un livre
app.delete('/books/:bookId/return', authenticate, async (req, res) => {
    const { bookId } = req.params;
    const emprunt = await prisma.emprunt.findFirst({ where: { id_book: bookId, id_user: req.user.userId } });
    if (!emprunt) return res.status(400).json({ error: 'Aucun emprunt trouvé' });
    await prisma.emprunt.delete({ where: { id: emprunt.id } });
    await prisma.book.update({ where: { id: bookId }, data: { disponible: true } });
    res.json({ message: 'Livre retourné avec succès' });
});

// Voir mes emprunts
app.get('/me/loans', authenticate, async (req, res) => {
    const emprunts = await prisma.emprunt.findMany({ 
        where: { id_user: req.user.userId }, 
        include: { 
            book: {
                include: {
                    genres: {
                        include: {
                            genre: true // inclut les noms de genres
                        }
                    }
                }
            }
        }
    });
    res.json(emprunts);
});

// Mettre à jour le Profile
app.put('/update-profile', authenticate, async (req, res) => {
    const { nom, prenom, email } = req.body;
    const userId = req.user.userId;
  
    if (!nom || !prenom || !email) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
  
    try {
      // Check if new email is already in use by another user
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ error: "Cet email est déjà utilisé." });
      }
  
      // Mette à jour la base de données
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { nom, prenom, email },
      });
  
      // Creation d'un nouveau token avec les nouvelles informations
      const token = jwt.sign({
        userId: updatedUser.id,
        email: updatedUser.email,
        nom: updatedUser.nom,
        prenom: updatedUser.prenom,
      }, JWT_SECRET, { expiresIn: '1d' });
  
      res.json({ message: 'Profil mis à jour', token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Modifier le mot de passe
app.put('/update-password', authenticate, async (req, res) => {
    const { currentPass, newPass, confirmPass } = req.body;

    if (!currentPass || !newPass || !confirmPass) {
        return res.status(400).json({ error: "Tous les champs sont requis." });
    }

    if (newPass !== confirmPass) {
        return res.status(400).json({ error: "Les mots de passe ne correspondent pas." });
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
    });

    if (!user) {
        return res.status(404).json({ error: "Utilisateur non trouvé." });
    }

    const isMatch = await bcrypt.compare(currentPass, user.password);
    if (!isMatch) {
        return res.status(400).json({ error: "Mot de passe actuel incorrect." });
    }

    const hashedPassword = await bcrypt.hash(newPass, 10);

    await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
    });

    res.json({ message: "Mot de passe mis à jour avec succès." });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Serveur démarré sur le port ${PORT}`));