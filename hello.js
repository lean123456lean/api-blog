const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();
const router = express.Router(); // Usaremos rotas para configurar o servidor sem conflitos
const db = new sqlite3.Database('./database.db');

// Middleware
app.use(cors({
  origin: ['https://lean123456lean.github.io', 'http://127.0.0.1:5503'],
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: 'Content-Type,Authorization',
}));

app.use(bodyParser.json());
app.use(cookieParser());

// Configurações do banco de dados SQLite
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, author TEXT, text TEXT, modal_id TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

// Rota de registro
router.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Todos os campos são obrigatórios!' });

  const hashedPassword = await bcrypt.hash(password, 10);
  db.run(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`, [name, email, hashedPassword], (err) => {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ message: 'Usuário já cadastrado!' });
      return res.status(500).json({ message: 'Erro ao registrar usuário.' });
    }
    res.status(201).json({ message: 'Usuário cadastrado com sucesso!' });
  });
});

// Rota de login
router.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email e senha são obrigatórios!' });

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) return res.status(500).json({ message: 'Erro no servidor.' });
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado!' });

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) return res.status(401).json({ message: 'Senha incorreta!' });

    const token = jwt.sign({ email: user.email }, process.env.SECRET_KEY, { expiresIn: '1h' });
    res.cookie('authToken', token, { httpOnly: true, maxAge: 3600000 });
    res.status(200).json({ message: 'Login bem-sucedido!' });
  });
});

// Rota protegida
router.get('/api/protected', (req, res) => {
  const token = req.cookies.authToken;
  if (!token) return res.status(401).json({ message: 'Acesso negado!' });

  try {
    const verified = jwt.verify(token, process.env.SECRET_KEY);
    res.status(200).json({ message: 'Acesso permitido!', user: verified });
  } catch {
    res.status(401).json({ message: 'Token inválido!' });
  }
});

// Rota para buscar artigos do Dev.to
router.get('/api/devto-articles', async (req, res) => {
  try {
    const response = await axios.get('https://dev.to/api/articles', { params: { tag: 'javascript', per_page: 10 } });
    const articles = response.data.map((article) => ({
      title: article.title,
      description: article.description,
      url: article.url,
      image: article.cover_image || 'https://via.placeholder.com/150',
      publishedAt: article.published_at,
      author: article.user.name,
    }));
    res.status(200).json(articles);
  } catch {
    res.status(500).json({ error: 'Erro ao buscar artigos do Dev.to' });
  }
});

// Integre o roteador ao aplicativo Express
app.use(router);

// Exportar a função handler para a Vercel
module.exports = app;
