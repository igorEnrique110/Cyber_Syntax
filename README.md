# Cyber Syntax

Jogo educacional para treinar lÃ³gica de programaÃ§Ã£o organizando linhas de cÃ³digo na ordem correta.

## Tecnologias

- Backend: Python puro com `http.server`
- Banco de dados: SQLite
- Frontend: HTML, CSS e JavaScript puro

O projeto nÃ£o usa frameworks externos.

## Como executar

```bash
python server.py
```

Depois acesse:

```text
http://localhost:8000
```

## Funcionalidades atuais

- Cadastro e login de jogador com email.
- Menu principal com fase recomendada, mÃ³dulos e ranking.
- Ranking por maior pontuaÃ§Ã£o.
- Banco SQLite com tabelas e colunas em portuguÃªs.
- Escolha de uma linguagem principal, com os outros mÃ³dulos bloqueados para o jogador.
- MÃ³dulos de fases, como Python e Java.
- Sistema de progresso por jogador.
- Sistema de moedas.
- Compra de dica.
- Compra de vida.
- OpÃ§Ã£o de pular fase usando moedas.
- Sistema de vidas.
- Dificuldade adaptativa simples com base em acertos e erros recentes.
- Tela de jogo com seleÃ§Ã£o de linha e botÃµes de subir, descer e remover.
- Interface inspirada em Matrix e IDEs de programaÃ§Ã£o.

## Principais tabelas do banco

- `jogadores`
- `sessoes`
- `modulos`
- `fases`
- `progresso_jogador`
- `tentativas`
- `transacoes_moedas`

## ObservaÃ§Ã£o sobre POSCOMP

O POSCOMP deve ser tratado como fonte/base de importaÃ§Ã£o de questÃµes para o banco, nÃ£o como mÃ³dulo jogÃ¡vel separado. A importaÃ§Ã£o automÃ¡tica de PDFs ainda nÃ£o foi implementada; o ideal Ã© manter uma etapa de curadoria antes de publicar novas fases.

