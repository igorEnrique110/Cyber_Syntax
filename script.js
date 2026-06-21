document.addEventListener("DOMContentLoaded", () => {
    const estado = {
        jogador: null,
        menu: null,
        fase: null,
        tempoRestante: 0,
        intervaloTimer: null,
        linhaSelecionada: null,
        usouDica: false,
        dicasUsadas: 0,
        telaAtual: null,
        telaAnterior: null,
        linguagemSelecionada: null,
    };

    const telas = {
        auth: document.getElementById("auth-screen"),
        menu: document.getElementById("menu-screen"),
        jogo: document.getElementById("game-screen"),
    };

    const authForm = document.getElementById("auth-form");
    const authName = document.getElementById("auth-name");
    const authEmail = document.getElementById("auth-email");
    const authPassword = document.getElementById("auth-password");
    const authMessage = document.getElementById("auth-message");
    const btnRegister = document.getElementById("btn-register");
    const btnLogout = document.getElementById("btn-logout");
    const btnBackPrevious = document.getElementById("btn-back-previous");

    const menuPlayer = document.getElementById("menu-player");
    const menuPoints = document.getElementById("menu-points");
    const menuCoins = document.getElementById("menu-coins");
    const menuLives = document.getElementById("menu-lives");
    const rankingList = document.getElementById("ranking-list");
    const modulesList = document.getElementById("modules-list");
    const languageOptions = document.getElementById("language-options");
    const languageStatusList = document.getElementById("language-status-list");

    const btnBackMenu = document.getElementById("btn-back-menu");
    const levelTitle = document.getElementById("level-title");
    const levelDescription = document.getElementById("level-description");
    const levelMeta = document.getElementById("level-meta");
    const gamePoints = document.getElementById("game-points");
    const gameCoins = document.getElementById("game-coins");
    const gameLives = document.getElementById("game-lives");
    const timerDisplay = document.getElementById("timer");
    const sourceLines = document.getElementById("source-lines");
    const solutionArea = document.getElementById("solution-area");
    const hintBox = document.getElementById("hint-box");
    const btnHint = document.getElementById("btn-hint");
    const btnBuyTime = document.getElementById("btn-buy-time");
    const btnBuyLife = document.getElementById("btn-buy-life");
    const btnSkip = document.getElementById("btn-skip");
    const btnLineUp = document.getElementById("btn-line-up");
    const btnLineDown = document.getElementById("btn-line-down");
    const btnLineRemove = document.getElementById("btn-line-remove");
    const editMessage = document.getElementById("edit-message");
    const btnReset = document.getElementById("btn-reset");
    const btnVerify = document.getElementById("btn-verify");

    const modalOverlay = document.getElementById("modal-overlay");
    const modalTitle = document.getElementById("modal-title");
    const modalMessage = document.getElementById("modal-message");
    const modalExtra = document.getElementById("modal-extra");
    const modalCancelBtn = document.getElementById("modal-cancel-btn");
    const modalBtn = document.getElementById("modal-btn");

    // ─── MOCK LOCAL (sem servidor) ─────────────────────────────────────────────
    // Substitui chamadas HTTP por localStorage para funcionar no GitHub Pages.

    function gerarId() {
        return Date.now() + Math.random().toString(36).slice(2);
    }

    function hashSimples(senha) {
        // Hash não-criptográfico apenas para impedir senha em texto claro no storage
        let h = 0;
        for (let i = 0; i < senha.length; i++) {
            h = (Math.imul(31, h) + senha.charCodeAt(i)) | 0;
        }
        return 'h' + Math.abs(h).toString(36);
    }

    function salvarDB(db) {
        localStorage.setItem('cyber_syntax_db', JSON.stringify(db));
    }

    function carregarDB() {
        try {
            return JSON.parse(localStorage.getItem('cyber_syntax_db')) || { jogadores: [], sessao: null };
        } catch (_) {
            return { jogadores: [], sessao: null };
        }
    }

    function jogadorPublico(j) {
        return {
            id: j.id,
            nome: j.nome,
            email: j.email,
            pontos: j.pontos,
            moedas: j.moedas,
            vidas: j.vidas,
            nivel_habilidade: j.nivel_habilidade,
            fase_atual_id: j.fase_atual_id,
            modulo_escolhido_id: j.modulo_escolhido_id,
        };
    }

    // ── Gerador de conteúdo (port do Python para JS) ──────────────────────────

    function tipoInt(lang) { return lang === 'Java' || lang === 'C#' ? (lang === 'Java' ? 'int' : 'int') : 'const'; }

    function decl(lang, nome, valor, tipo) {
        if (lang === 'Python') return `${nome} = ${valor}`;
        if (lang === 'JavaScript') return `const ${nome} = ${valor};`;
        const t = tipo || 'int';
        return `${t} ${nome} = ${valor};`;
    }

    function assign(lang, nome, valor) {
        return lang === 'Python' ? `${nome} = ${valor}` : `${nome} = ${valor};`;
    }

    function printLine(lang, expr) {
        if (lang === 'Python') return `print(${expr})`;
        if (lang === 'JavaScript') return `console.log(${expr});`;
        if (lang === 'C#') return `Console.WriteLine(${expr});`;
        return `System.out.println(${expr});`;
    }

    function tipoStr(lang) {
        if (lang === 'Java') return 'String';
        if (lang === 'C#') return 'string';
        if (lang === 'JavaScript') return 'const';
        return '';
    }

    function varLinhas(lang, n) {
        const py = lang === 'Python';
        if (n === 1) return [decl(lang, 'idade', '20'), printLine(lang, 'idade')];
        if (n === 2) return [decl(lang, 'nome', '"Ana"', tipoStr(lang)), decl(lang, 'mensagem', '"Ola, " + nome', tipoStr(lang)), printLine(lang, 'mensagem')];
        if (n === 3) return [decl(lang, 'a', '5'), decl(lang, 'b', '10'), decl(lang, 'soma', 'a + b'), printLine(lang, 'soma')];
        if (n === 4) { const t = (lang === 'Java' || lang === 'C#') ? 'double' : null; return [decl(lang, 'nota1', '8', t), decl(lang, 'nota2', '6', t), decl(lang, 'media', '(nota1 + nota2) / 2', t), printLine(lang, 'media')]; }
        if (n === 5) { const t = (lang === 'Java' || lang === 'C#') ? 'double' : null; return [decl(lang, 'preco', '100', t), decl(lang, 'desconto', '15', t), decl(lang, 'finalCompra', 'preco - desconto', t), printLine(lang, 'finalCompra')]; }
        if (n === 6) { const t = lang === 'Java' ? 'boolean' : lang === 'C#' ? 'bool' : null; const v = py ? 'True' : 'true'; return [decl(lang, 'ativo', v, t), printLine(lang, 'ativo')]; }
        if (n === 7) return [decl(lang, 'base', '4'), decl(lang, 'altura', '3'), decl(lang, 'area', 'base * altura'), printLine(lang, 'area')];
        if (n === 8) { const t = tipoStr(lang); return [decl(lang, 'produto', '"Livro"', t), decl(lang, 'quantidade', '2'), decl(lang, 'resumo', 'produto + ": " + quantidade', t), printLine(lang, 'resumo')]; }
        if (n === 9) { const tb = lang === 'Java' ? 'boolean' : lang === 'C#' ? 'bool' : null; return [decl(lang, 'temperatura', '38'), decl(lang, 'febre', 'temperatura >= 37', tb), printLine(lang, 'febre')]; }
        return [decl(lang, 'contador', '1'), assign(lang, 'contador', 'contador + 1'), printLine(lang, 'contador')];
    }

    function condLinhas(lang, n) {
        const py = lang === 'Python';
        let out = [];
        if (n === 1) out = [decl(lang, 'idade', '18'), py ? 'if idade >= 18:' : 'if (idade >= 18) {', '    ' + printLine(lang, py ? "'Maior de idade'" : '"Maior de idade"')];
        else if (n === 2) out = [decl(lang, 'nota', '6'), py ? 'if nota >= 7:' : 'if (nota >= 7) {', '    ' + printLine(lang, py ? "'Aprovado'" : '"Aprovado"'), py ? 'else:' : '} else {', '    ' + printLine(lang, py ? "'Revisar'" : '"Revisar"')];
        else if (n === 3) out = [decl(lang, 'numero', '8'), py ? 'if numero % 2 == 0:' : 'if (numero % 2 == 0) {', '    ' + printLine(lang, py ? "'Par'" : '"Par"'), py ? 'else:' : '} else {', '    ' + printLine(lang, py ? "'Impar'" : '"Impar"')];
        else if (n === 4) out = [decl(lang, 'saldo', '100'), decl(lang, 'saque', '60'), py ? 'if saldo >= saque:' : 'if (saldo >= saque) {', '    ' + printLine(lang, py ? "'Saque permitido'" : '"Saque permitido"')];
        else if (n === 5) out = [decl(lang, 'temperatura', '30'), py ? 'if temperatura > 28:' : 'if (temperatura > 28) {', '    ' + printLine(lang, py ? "'Calor'" : '"Calor"'), py ? 'else:' : '} else {', '    ' + printLine(lang, py ? "'Agradavel'" : '"Agradavel"')];
        else if (n === 6) { const s = decl(lang, 'senha', '"1234"', tipoStr(lang)); const c = py ? 'senha == "1234"' : lang === 'Java' ? 'senha.equals("1234")' : 'senha == "1234"'; out = [s, py ? `if ${c}:` : `if (${c}) {`, '    ' + printLine(lang, py ? "'Acesso liberado'" : '"Acesso liberado"')]; }
        else if (n === 7) out = [decl(lang, 'media', '5'), py ? 'if media >= 7:' : 'if (media >= 7) {', '    ' + printLine(lang, py ? "'Aprovado'" : '"Aprovado"'), py ? 'elif media >= 5:' : '} else if (media >= 5) {', '    ' + printLine(lang, py ? "'Recuperacao'" : '"Recuperacao"'), py ? 'else:' : '} else {', '    ' + printLine(lang, py ? "'Reprovado'" : '"Reprovado"')];
        else if (n === 8) out = [decl(lang, 'a', '9'), decl(lang, 'b', '4'), py ? 'if a > b:' : 'if (a > b) {', '    ' + printLine(lang, 'a'), py ? 'else:' : '} else {', '    ' + printLine(lang, 'b')];
        else if (n === 9) out = [decl(lang, 'estoque', '3'), py ? 'if estoque > 0:' : 'if (estoque > 0) {', '    ' + printLine(lang, py ? "'Disponivel'" : '"Disponivel"')];
        else { const tb = lang === 'Java' ? 'boolean' : lang === 'C#' ? 'bool' : null; const tv = py ? 'True' : 'true'; out = [decl(lang, 'idade', '20'), decl(lang, 'temConvite', tv, tb), py ? 'if idade >= 18 and temConvite:' : 'if (idade >= 18 && temConvite) {', '    ' + printLine(lang, py ? "'Pode entrar'" : '"Pode entrar"')]; }
        if (!py) out.push('}');
        return out;
    }

    function loopLinhas(lang, n) {
        const py = lang === 'Python';
        const forI = py ? 'for i in range(1, 4):' : lang === 'JavaScript' ? 'for (let i = 1; i <= 3; i++) {' : 'for (int i = 1; i <= 3; i++) {';
        if (n === 1) return [forI, '    ' + printLine(lang, 'i')].concat(py ? [] : ['}']);
        if (n === 2) return [decl(lang, 'contador', '1'), py ? 'while contador <= 3:' : 'while (contador <= 3) {', '    ' + printLine(lang, 'contador'), py ? '    contador = contador + 1' : '    contador++;'].concat(py ? [] : ['}']);
        if (n === 3) { const lista = py ? "nomes = ['Ana', 'Bia']" : lang === 'Java' ? 'String[] nomes = {"Ana", "Bia"};' : lang === 'C#' ? 'string[] nomes = { "Ana", "Bia" };' : "const nomes = ['Ana', 'Bia'];"; const loop = py ? 'for nome in nomes:' : lang === 'Java' ? 'for (String nome : nomes) {' : lang === 'C#' ? 'foreach (string nome in nomes) {' : 'for (const nome of nomes) {'; return [lista, loop, '    ' + printLine(lang, 'nome')].concat(py ? [] : ['}']); }
        if (n === 4) { const f = py ? 'for i in range(1, 4):' : lang === 'JavaScript' ? 'for (let i = 1; i <= 3; i++) {' : 'for (int i = 1; i <= 3; i++) {'; return py ? [decl(lang, 'soma', '0'), f, '    soma = soma + i', printLine(lang, 'soma')] : [decl(lang, 'soma', '0'), f, '    soma = soma + i;', '}', printLine(lang, 'soma')]; }
        if (n === 5) { const f = py ? 'for i in range(1, 6):' : lang === 'JavaScript' ? 'for (let i = 1; i <= 5; i++) {' : 'for (int i = 1; i <= 5; i++) {'; return [f, py ? '    if i % 2 == 0:' : '    if (i % 2 == 0) {', '        ' + printLine(lang, 'i')].concat(py ? [] : ['    }', '}']); }
        if (n === 6) return [decl(lang, 'numero', '3'), py ? 'while numero > 0:' : 'while (numero > 0) {', '    ' + printLine(lang, 'numero'), py ? '    numero = numero - 1' : '    numero--;'].concat(py ? [] : ['}']);
        if (n === 7) { const f = py ? 'for i in range(1, 5):' : lang === 'JavaScript' ? 'for (let i = 1; i <= 4; i++) {' : 'for (int i = 1; i <= 4; i++) {'; return py ? [decl(lang, 'total', '0'), f, '    total = total + 2', printLine(lang, 'total')] : [decl(lang, 'total', '0'), f, '    total = total + 2;', '}', printLine(lang, 'total')]; }
        if (n === 8) { if (py) return [decl(lang, 'aprovados', '0'), 'for nota in [8, 5, 9]:', '    if nota >= 7:', '        aprovados = aprovados + 1', printLine(lang, 'aprovados')]; const arr = lang === 'Java' ? 'int[] notas = {8, 5, 9};' : lang === 'C#' ? 'int[] notas = {8, 5, 9};' : 'const notas = [8, 5, 9];'; const fl = lang === 'Java' ? 'for (int nota : notas) {' : lang === 'C#' ? 'foreach (int nota in notas) {' : 'for (const nota of notas) {'; return [decl(lang, 'aprovados', '0'), arr, fl, '    if (nota >= 7) {', '        aprovados = aprovados + 1;', '    }', '}', printLine(lang, 'aprovados')]; }
        if (n === 9) return [decl(lang, 'i', '0'), py ? 'while i < 2:' : 'while (i < 2) {', py ? "    " + printLine(lang, "'Logica'") : '    ' + printLine(lang, '"Logica"'), py ? '    i = i + 1' : '    i++;'].concat(py ? [] : ['}']);
        return [py ? "for letra in 'ABC':" : lang === 'Java' ? 'for (char letra : "ABC".toCharArray()) {' : lang === 'C#' ? 'foreach (char letra in "ABC") {' : "for (const letra of 'ABC') {", '    ' + printLine(lang, 'letra')].concat(py ? [] : ['}']);
    }

    function funcLinhas(lang, n) {
        const py = lang === 'Python';
        if (n === 1) {
            const fd = py ? 'def dobro(n):' : lang === 'Java' ? 'static int dobro(int n) {' : lang === 'C#' ? 'static int Dobro(int n) {' : 'function dobro(n) {';
            const ret = py ? '    return n * 2' : '    return n * 2;';
            const call = lang === 'C#' ? 'Dobro(5)' : 'dobro(5)';
            return py ? [fd, ret, 'resultado = dobro(5)', 'print(resultado)'] : [fd, ret, '}', decl(lang, 'resultado', call), printLine(lang, 'resultado')];
        }
        const nm = lang === 'C#' ? 'Soma' : 'soma';
        if (n === 2) {
            const fd = py ? 'def soma(a, b):' : lang === 'Java' ? 'static int soma(int a, int b) {' : lang === 'C#' ? 'static int Soma(int a, int b) {' : 'function soma(a, b) {';
            return py ? [fd, '    return a + b', 'total = soma(2, 3)', 'print(total)'] : [fd, '    return a + b;', '}', decl(lang, 'total', `${nm}(2, 3)`), printLine(lang, 'total')];
        }
        if (n === 3) {
            const fn = lang === 'C#' ? 'EhPar' : 'ehPar'; const ret = lang === 'Java' ? 'boolean' : lang === 'C#' ? 'bool' : '';
            const fd = py ? 'def eh_par(n):' : lang === 'Java' ? `static ${ret} ${fn}(int n) {` : lang === 'C#' ? `static ${ret} ${fn}(int n) {` : `function ${fn}(n) {`;
            const tb = lang === 'Java' ? 'boolean' : lang === 'C#' ? 'bool' : null;
            return py ? [fd, '    return n % 2 == 0', 'par = eh_par(4)', 'print(par)'] : [fd, '    return n % 2 == 0;', '}', decl(lang, 'par', `${fn}(4)`, tb), printLine(lang, 'par')];
        }
        if (n === 4) {
            const fn = lang === 'C#' ? 'Maior' : 'maior';
            const fd = py ? 'def maior(a, b):' : `static int ${fn}(int a, int b) {`;
            return py ? [fd, '    return a if a > b else b', 'valor = maior(9, 4)', 'print(valor)'] : [fd, '    return a > b ? a : b;', '}', decl(lang, 'valor', `${fn}(9, 4)`), printLine(lang, 'valor')];
        }
        if (n === 5) {
            const fn = lang === 'C#' ? 'Saudacao' : 'saudacao'; const ts = tipoStr(lang);
            const fd = py ? 'def saudacao(nome):' : lang === 'Java' ? `static String ${fn}(String nome) {` : lang === 'C#' ? `static string ${fn}(string nome) {` : `function ${fn}(nome) {`;
            return py ? [fd, "    return 'Ola, ' + nome", "texto = saudacao('Ana')", 'print(texto)'] : [fd, '    return "Ola, " + nome;', '}', decl(lang, 'texto', `${fn}("Ana")`, ts), printLine(lang, 'texto')];
        }
        return funcLinhas(lang, ((n - 6) % 5) + 1);
    }

    function limpar(linhas) { return linhas.filter(l => l !== ''); }

    const LINGUAGENS = ['Java', 'Python', 'JavaScript', 'C#'];
    const ASSUNTOS = [
        { ordem: 1, titulo: 'Variáveis e Saída', slug: 'variaveis', descricao: 'Conceitos iniciais: declaração de variáveis, cálculos simples e exibição de valores.' },
        { ordem: 2, titulo: 'Condicionais', slug: 'condicionais', descricao: 'Decisões com if, else e comparações lógicas.' },
        { ordem: 3, titulo: 'Estruturas de Repetição', slug: 'repeticao', descricao: 'Laços for, while, percursos em listas/arrays e acumuladores.' },
        { ordem: 4, titulo: 'Funções e Métodos', slug: 'funcoes', descricao: 'Criação e uso de funções/métodos com parâmetros e retorno.' },
    ];
    const GERADORES = { variaveis: varLinhas, condicionais: condLinhas, repeticao: loopLinhas, funcoes: funcLinhas };

    function gerarFases() {
        const fases = [];
        let faseId = 1;
        let moduloId = 1;
        const modulos = [];
        for (const lang of LINGUAGENS) {
            for (const assunto of ASSUNTOS) {
                const mod = { id: moduloId, titulo: `${lang} ${String(assunto.ordem).padStart(2,'0')} - ${assunto.titulo}`, slug: `${lang.toLowerCase().replace('#','sharp')}-${assunto.slug}`, descricao: assunto.descricao, linguagem: lang, ordem: assunto.ordem };
                modulos.push(mod);
                for (let n = 1; n <= 10; n++) {
                    const linhas = limpar(GERADORES[assunto.slug](lang, n));
                    fases.push({
                        id: faseId++,
                        modulo_id: moduloId,
                        titulo: `${lang} ${assunto.ordem}.${String(n).padStart(2,'0')} - ${assunto.titulo}`,
                        descricao: `Organize as linhas sobre ${assunto.titulo.toLowerCase()} em ${lang}.`,
                        linhas_codigo: linhas,
                        ordem_correta: linhas.map((_, i) => i),
                        dica: 'Procure primeiro as linhas que criam valores; depois organize o processamento e a saída.',
                        explicacao: 'A ordem correta segue a criação dos dados, a decisão/processamento e a exibição do resultado.',
                        dificuldade: assunto.ordem,
                        tempo_limite: 60 + assunto.ordem * 15,
                        recompensa_moedas: 10 + assunto.ordem * 5,
                        fonte: 'autor',
                        status: 'publicada',
                        ordem: n,
                    });
                }
                moduloId++;
            }
        }
        return { modulos, fases };
    }

    const CONTEUDO = gerarFases();

    function obterFase(id) { return CONTEUDO.fases.find(f => f.id === id) || null; }
    function obterModulo(id) { return CONTEUDO.modulos.find(m => m.id === id) || null; }
    function fasesDoModulo(moduloId) { return CONTEUDO.fases.filter(f => f.modulo_id === moduloId && f.status === 'publicada').sort((a,b) => a.ordem - b.ordem); }

    function progressoJogador(j) { return j.progresso || {}; }

    function proximaFaseModulo(j, moduloId) {
        const fases = fasesDoModulo(moduloId);
        const prog = progressoJogador(j);
        return fases.find(f => prog[f.id] !== 'concluida' && prog[f.id] !== 'pulada') || fases[0] || null;
    }

    function moduloConcluido(j, moduloId) {
        const fases = fasesDoModulo(moduloId);
        const prog = progressoJogador(j);
        return fases.length > 0 && fases.every(f => prog[f.id] === 'concluida' || prog[f.id] === 'pulada');
    }

    function modulosLiberados(j) {
        const liberados = new Set();
        const porLinguagem = {};
        for (const m of CONTEUDO.modulos) {
            (porLinguagem[m.linguagem] = porLinguagem[m.linguagem] || []).push(m);
        }
        for (const lang of Object.keys(porLinguagem)) {
            const sorted = porLinguagem[lang].sort((a,b) => a.ordem - b.ordem);
            for (let i = 0; i < sorted.length; i++) {
                if (i === 0 || moduloConcluido(j, sorted[i-1].id)) liberados.add(sorted[i].id);
            }
        }
        return liberados;
    }

    function statusLinguagens(j) {
        const porLinguagem = {};
        for (const m of CONTEUDO.modulos) {
            (porLinguagem[m.linguagem] = porLinguagem[m.linguagem] || []).push(m);
        }
        return Object.entries(porLinguagem).map(([lang, mods]) => {
            const todasFases = mods.flatMap(m => fasesDoModulo(m.id));
            const prog = progressoJogador(j);
            const concluidas = todasFases.filter(f => prog[f.id] === 'concluida').length;
            let faseRetomadaId = null;
            for (const m of mods.sort((a,b) => a.ordem - b.ordem)) {
                const f = proximaFaseModulo(j, m.id);
                if (f && prog[f.id] !== 'concluida') { faseRetomadaId = f.id; break; }
            }
            return {
                linguagem: lang,
                fases_concluidas: concluidas,
                total_fases: todasFases.length,
                percentual: todasFases.length ? Math.round(concluidas / todasFases.length * 100) : 0,
                fase_retomada_id: faseRetomadaId,
            };
        });
    }

    function dadosMenu(j) {
        const liberados = modulosLiberados(j);
        const prog = progressoJogador(j);
        return {
            jogador: jogadorPublico(j),
            ranking: carregarDB().jogadores.filter(x => x.ativo !== false).map(x => ({ nome: x.nome, pontos: x.pontos })).sort((a,b) => b.pontos - a.pontos).slice(0, 10),
            linguagens: statusLinguagens(j),
            modulos: CONTEUDO.modulos.map(m => {
                const fases = fasesDoModulo(m.id);
                const concluidas = fases.filter(f => prog[f.id] === 'concluida').length;
                const faseAtual = proximaFaseModulo(j, m.id);
                return {
                    id: m.id, titulo: m.titulo, slug: m.slug, descricao: m.descricao,
                    linguagem: m.linguagem, ordem: m.ordem,
                    total_fases: fases.length,
                    fases_concluidas: concluidas,
                    liberado: liberados.has(m.id),
                    concluido: moduloConcluido(j, m.id),
                    fase_atual: faseAtual ? { id: faseAtual.id, numero_fase: faseAtual.ordem } : null,
                };
            }),
        };
    }

    function salvarJogador(j) {
        const db = carregarDB();
        const idx = db.jogadores.findIndex(x => x.id === j.id);
        if (idx >= 0) db.jogadores[idx] = j; else db.jogadores.push(j);
        salvarDB(db);
    }

    function jogadorAtual() {
        const db = carregarDB();
        if (!db.sessao) return null;
        return db.jogadores.find(j => j.id === db.sessao) || null;
    }

    // ── Mock da função api() ──────────────────────────────────────────────────

    async function api(caminho, opcoes = {}) {
        await new Promise(r => setTimeout(r, 30)); // simula latência mínima
        const metodo = (opcoes.method || 'GET').toUpperCase();
        const corpo = opcoes.body ? JSON.parse(opcoes.body) : {};

        // GET /api/sessao
        if (caminho === '/api/sessao') {
            const j = jogadorAtual();
            return { jogador: j ? jogadorPublico(j) : null };
        }

        // POST /api/login
        if (caminho === '/api/login') {
            const db = carregarDB();
            const j = db.jogadores.find(x => x.email === (corpo.email || '').trim().toLowerCase());
            if (!j || j.senha_hash !== hashSimples(corpo.senha || '')) {
                throw new Error('Email ou senha inválidos.');
            }
            db.sessao = j.id;
            salvarDB(db);
            return { jogador: jogadorPublico(j) };
        }

        // POST /api/cadastro
        if (caminho === '/api/cadastro') {
            const nome = (corpo.nome || '').trim();
            const email = (corpo.email || '').trim().toLowerCase();
            const senha = corpo.senha || '';
            if (nome.length < 2 || !email.includes('@') || senha.length < 4) {
                throw new Error('Informe nome, email válido e senha com pelo menos 4 caracteres.');
            }
            const db = carregarDB();
            if (db.jogadores.find(x => x.email === email)) {
                throw new Error('Já existe jogador cadastrado com este email.');
            }
            const novo = { id: gerarId(), nome, email, senha_hash: hashSimples(senha), pontos: 0, moedas: 50, vidas: 5, nivel_habilidade: 1, fase_atual_id: null, modulo_escolhido_id: null, progresso: {} };
            db.jogadores.push(novo);
            db.sessao = novo.id;
            salvarDB(db);
            return { jogador: jogadorPublico(novo) };
        }

        // POST /api/logout
        if (caminho === '/api/logout') {
            const db = carregarDB();
            db.sessao = null;
            salvarDB(db);
            return {};
        }

        // GET /api/menu
        if (caminho === '/api/menu') {
            const j = jogadorAtual();
            if (!j) throw new Error('Sessão expirada. Faça login novamente.');
            return dadosMenu(j);
        }

        // POST /api/escolher-modulo
        if (caminho === '/api/escolher-modulo') {
            const j = jogadorAtual();
            if (!j) throw new Error('Sessão expirada.');
            const liberados = modulosLiberados(j);
            if (!liberados.has(corpo.modulo_id)) throw new Error('Módulo bloqueado.');
            j.modulo_escolhido_id = corpo.modulo_id;
            j.fase_atual_id = null;
            salvarJogador(j);
            return dadosMenu(j);
        }

        // GET /api/fases
        if (caminho.startsWith('/api/fases')) {
            const params = new URLSearchParams(caminho.split('?')[1] || '');
            const moduloId = Number(params.get('modulo_id'));
            const fases = fasesDoModulo(moduloId);
            const j = jogadorAtual();
            const prog = j ? progressoJogador(j) : {};
            return { fases: fases.map(f => ({ id: f.id, titulo: f.titulo, progresso: prog[f.id] || null })) };
        }

        // GET /api/fase
        if (caminho.startsWith('/api/fase')) {
            const params = new URLSearchParams(caminho.split('?')[1] || '');
            const faseId = Number(params.get('id'));
            const f = obterFase(faseId);
            if (!f) throw new Error('Fase não encontrada.');
            const j = jogadorAtual();
            if (j) { j.fase_atual_id = faseId; j.modulo_escolhido_id = f.modulo_id; salvarJogador(j); }
            return { fase: { ...f } };
        }

        // POST /api/verificar
        if (caminho === '/api/verificar') {
            const j = jogadorAtual();
            if (!j) throw new Error('Sessão expirada.');
            const f = obterFase(corpo.fase_id);
            if (!f) throw new Error('Fase não encontrada.');
            const acertou = JSON.stringify(corpo.ordem) === JSON.stringify(f.ordem_correta);
            if (acertou) {
                const pontosGanhos = 100 + (corpo.tempo_restante || 0) * 10 + f.dificuldade * 20 - (corpo.usou_dica ? 50 : 0);
                const moedasGanhas = f.recompensa_moedas;
                j.pontos = (j.pontos || 0) + Math.max(50, pontosGanhos);
                j.moedas = (j.moedas || 0) + moedasGanhas;
                j.progresso = j.progresso || {};
                j.progresso[f.id] = 'concluida';
                j.fase_atual_id = null;
                const concluido = moduloConcluido(j, f.modulo_id);
                let moduloLiberado = null;
                if (concluido) {
                    const m = obterModulo(f.modulo_id);
                    const prox = CONTEUDO.modulos.find(x => x.linguagem === m.linguagem && x.ordem === m.ordem + 1);
                    if (prox) moduloLiberado = { id: prox.id, titulo: prox.titulo };
                }
                const proximaFase = proximaFaseModulo(j, f.modulo_id);
                salvarJogador(j);
                return { acertou: true, pontos_ganhos: Math.max(50, pontosGanhos), moedas_ganhas: moedasGanhas, explicacao: f.explicacao, jogador: jogadorPublico(j), modulo_concluido: concluido, modulo_liberado: moduloLiberado, proxima_fase: proximaFase ? { id: proximaFase.id } : null };
            } else {
                j.vidas = Math.max(0, (j.vidas || 1) - 1);
                const vidasEsgotadas = j.vidas === 0;
                if (vidasEsgotadas) { j.pontos = 0; j.moedas = 0; j.progresso = {}; j.fase_atual_id = null; j.modulo_escolhido_id = null; j.vidas = 5; }
                salvarJogador(j);
                return { acertou: false, vidas_restantes: j.vidas, vidas_esgotadas: vidasEsgotadas, jogador: jogadorPublico(j) };
            }
        }

        // POST /api/falha
        if (caminho === '/api/falha') {
            const j = jogadorAtual();
            if (!j) throw new Error('Sessão expirada.');
            j.vidas = Math.max(0, (j.vidas || 1) - 1);
            const vidasEsgotadas = j.vidas === 0;
            if (vidasEsgotadas) { j.pontos = 0; j.moedas = 0; j.progresso = {}; j.fase_atual_id = null; j.modulo_escolhido_id = null; j.vidas = 5; }
            salvarJogador(j);
            return { vidas_esgotadas: vidasEsgotadas, jogador: jogadorPublico(j) };
        }

        // POST /api/dica
        if (caminho === '/api/dica') {
            const j = jogadorAtual();
            if (!j) throw new Error('Sessão expirada.');
            const f = obterFase(corpo.fase_id);
            const custos = [10, 15, 20, 30, 45];
            const numeroDica = corpo.numero_dica || 1;
            const custo = custos[numeroDica - 1] || 45;
            if ((j.moedas || 0) < custo) throw new Error(`Você precisa de ${custo} moedas para esta dica.`);
            j.moedas -= custo;
            salvarJogador(j);
            return { dica: f ? f.dica : 'Sem dica disponível.', dicas_usadas: numeroDica, jogador: jogadorPublico(j) };
        }

        // POST /api/comprar-vida
        if (caminho === '/api/comprar-vida') {
            const j = jogadorAtual();
            if (!j) throw new Error('Sessão expirada.');
            const custo = 25;
            if ((j.moedas || 0) < custo) throw new Error(`Você precisa de ${custo} moedas para comprar uma vida.`);
            j.moedas -= custo;
            j.vidas = (j.vidas || 0) + 1;
            salvarJogador(j);
            return { custo, jogador: jogadorPublico(j) };
        }

        // POST /api/comprar-tempo
        if (caminho === '/api/comprar-tempo') {
            const j = jogadorAtual();
            if (!j) throw new Error('Sessão expirada.');
            const custo = 20; const tempoAdicionado = 40;
            if ((j.moedas || 0) < custo) throw new Error(`Você precisa de ${custo} moedas para comprar tempo.`);
            j.moedas -= custo;
            salvarJogador(j);
            return { tempo_adicionado: tempoAdicionado, jogador: jogadorPublico(j) };
        }

        // POST /api/pular-fase
        if (caminho === '/api/pular-fase') {
            const j = jogadorAtual();
            if (!j) throw new Error('Sessão expirada.');
            if ((j.moedas || 0) < 30) throw new Error('Você precisa de 30 moedas para pular uma fase.');
            const f = obterFase(corpo.fase_id);
            j.moedas -= 30;
            j.pontos = Math.max(0, (j.pontos || 0) - 50);
            if (f) { j.progresso = j.progresso || {}; j.progresso[f.id] = 'pulada'; }
            j.fase_atual_id = null;
            const proxima = f ? proximaFaseModulo(j, f.modulo_id) : null;
            salvarJogador(j);
            return { jogador: jogadorPublico(j), proxima_fase: proxima ? { id: proxima.id } : null };
        }

        throw new Error(`Rota não encontrada: ${caminho}`);
    }
    // ─── FIM DO MOCK ───────────────────────────────────────────────────────────

    function mostrarTela(nome) {
        if (estado.telaAtual && estado.telaAtual !== nome) {
            estado.telaAnterior = estado.telaAtual;
        }
        estado.telaAtual = nome;
        Object.values(telas).forEach((tela) => tela.classList.add("hidden"));
        telas[nome].classList.remove("hidden");
    }

    async function voltarTelaAnterior() {
        if (estado.telaAnterior === "jogo" && estado.fase) {
            mostrarTela("jogo");
            iniciarTimer();
            return;
        }
        await api("/api/logout", { method: "POST", body: "{}" });
        estado.jogador = null;
        mostrarTela("auth");
    }

    function definirMensagem(elemento, texto, tipo = "") {
        elemento.textContent = texto || "";
        elemento.dataset.type = tipo;
    }

    [authName, authEmail, authPassword].forEach((campo) => {
        campo.addEventListener("input", () => definirMensagem(authMessage, ""));
    });

    function atualizarJogador(jogador) {
        if (!jogador) return;
        const vidasAntes = estado.jogador ? estado.jogador.vidas : null;
        estado.jogador = jogador;
        menuPlayer.textContent = jogador.nome;
        menuPoints.textContent = `${jogador.pontos} pts`;
        menuCoins.textContent = `${jogador.moedas} moedas`;
        menuLives.textContent = `${jogador.vidas} vidas`;
        gamePoints.textContent = `${jogador.pontos} pts`;
        gameCoins.textContent = `${jogador.moedas} moedas`;
        gameLives.textContent = `${jogador.vidas} vidas`;

        // Alerta ao chegar exatamente em 3 vidas (apenas durante o jogo)
        if (vidasAntes !== null && vidasAntes > 3 && jogador.vidas === 3 && estado.fase) {
            mostrarConfirmacao(
                'Você está ficando sem vidas!',
                'Você está ficando sem vidas. Deseja comprar mais?',
                'Sim, comprar',
                'Não, continuar',
                comprarVida
            );
        }
    }

    async function iniciar() {
        try {
            const dados = await api("/api/sessao");
            if (dados.jogador) {
                atualizarJogador(dados.jogador);
                await carregarMenu();
            } else {
                mostrarTela("auth");
            }
        } catch (erro) {
            console.warn(erro);
            definirMensagem(authMessage, "");
            mostrarTela("auth");
        }
    }

    async function carregarMenu() {
        limparTimer();
        const dados = await api("/api/menu");
        estado.menu = dados;
        atualizarJogador(dados.jogador);
        renderizarRanking(dados.ranking);
        definirLinguagemSelecionada(dados);
        renderizarStatusLinguagens(dados.linguagens || []);
        renderizarEscolhaLinguagem(dados.linguagens || []);
        renderizarModulos(dados.modulos || []);
        mostrarTela("menu");
    }

    function definirLinguagemSelecionada(dados) {
        const linguagens = dados.linguagens || [];
        if (!linguagens.length) return;

        const moduloAtual = (dados.modulos || []).find((modulo) => Number(modulo.id) === Number(dados.jogador.modulo_escolhido_id));
        if (!estado.linguagemSelecionada && moduloAtual) {
            estado.linguagemSelecionada = moduloAtual.linguagem;
        }

        const existe = linguagens.some((item) => item.linguagem === estado.linguagemSelecionada);
        if (!existe) {
            const comProgresso = linguagens.find((item) => item.fase_retomada_id);
            estado.linguagemSelecionada = (comProgresso || linguagens[0]).linguagem;
        }
    }

    function selecionarLinguagem(linguagem) {
        estado.linguagemSelecionada = linguagem;
        renderizarStatusLinguagens(estado.menu.linguagens || []);
        renderizarEscolhaLinguagem(estado.menu.linguagens || []);
        renderizarModulos(estado.menu.modulos || []);
    }

    function renderizarStatusLinguagens(linguagens) {
        if (!languageStatusList) return;
        languageStatusList.innerHTML = "";

        linguagens.forEach((item) => {
            const card = document.createElement("article");
            card.className = "language-status-card";
            if (item.linguagem === estado.linguagemSelecionada) card.classList.add("selected");

            const topo = document.createElement("div");
            topo.className = "status-card-top";

            const nome = document.createElement("strong");
            nome.textContent = item.linguagem;

            const percentual = document.createElement("span");
            percentual.textContent = `${item.percentual}% concluído`;
            topo.append(nome, percentual);

            const barra = document.createElement("div");
            barra.className = "progress-track";
            const preenchimento = document.createElement("span");
            preenchimento.style.width = `${Math.max(0, Math.min(100, item.percentual || 0))}%`;
            barra.appendChild(preenchimento);

            const detalhe = document.createElement("small");
            detalhe.textContent = `${item.fases_concluidas}/${item.total_fases} fases`;

            const acoes = document.createElement("div");
            acoes.className = "status-actions";

            const btnVer = document.createElement("button");
            btnVer.type = "button";
            btnVer.className = "btn ghost compact";
            btnVer.textContent = "Ver módulos";
            btnVer.onclick = () => selecionarLinguagem(item.linguagem);

            const btnRetomar = document.createElement("button");
            btnRetomar.type = "button";
            btnRetomar.className = "btn primary compact";
            btnRetomar.textContent = "Retomar";
            btnRetomar.disabled = !item.fase_retomada_id;
            btnRetomar.onclick = () => carregarFase(item.fase_retomada_id);

            acoes.append(btnVer, btnRetomar);
            card.append(topo, barra, detalhe, acoes);
            languageStatusList.appendChild(card);
        });
    }

    function renderizarEscolhaLinguagem(linguagens) {
        languageOptions.innerHTML = "";
        linguagens.forEach((item) => {
            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "language-choice";
            if (item.linguagem === estado.linguagemSelecionada) botao.classList.add("selected");

            const titulo = document.createElement("strong");
            titulo.textContent = item.linguagem;

            const detalhe = document.createElement("span");
            detalhe.textContent = `${item.percentual}% concluído`;

            botao.append(titulo, detalhe);
            botao.onclick = () => selecionarLinguagem(item.linguagem);
            languageOptions.appendChild(botao);
        });
    }

    function renderizarRanking(ranking) {
        rankingList.innerHTML = "";
        if (!ranking.length) {
            const vazio = document.createElement("li");
            vazio.textContent = "Ainda não há pontuação.";
            rankingList.appendChild(vazio);
            return;
        }

        ranking.forEach((jogador, indice) => {
            const item = document.createElement("li");
            const nome = document.createElement("span");
            const pontos = document.createElement("strong");
            nome.textContent = `${indice + 1}. ${jogador.nome}`;
            pontos.textContent = `${jogador.pontos} pts`;
            item.append(nome, pontos);
            rankingList.appendChild(item);
        });
    }

    function renderizarModulos(modulos) {
        modulesList.innerHTML = "";
        const modulosFiltrados = modulos.filter((modulo) => modulo.linguagem === estado.linguagemSelecionada);

        if (!modulosFiltrados.length) {
            const vazio = document.createElement("p");
            vazio.className = "empty-state";
            vazio.textContent = "Selecione uma linguagem para ver os módulos.";
            modulesList.appendChild(vazio);
            return;
        }

        modulosFiltrados.forEach((modulo) => {
            const moduloEscolhido = estado.jogador.modulo_escolhido_id;
            const estaEscolhido = Number(moduloEscolhido) === Number(modulo.id);
            const bloqueado = !modulo.liberado;
            const card = document.createElement("article");
            card.className = "module-card";
            if (estaEscolhido) card.classList.add("selected");
            if (bloqueado) card.classList.add("locked");

            const titulo = document.createElement("h3");
            titulo.textContent = modulo.titulo;

            const descricao = document.createElement("p");
            descricao.textContent = modulo.descricao;

            const progresso = document.createElement("span");
            const concluidas = modulo.fases_concluidas || 0;
            const total = modulo.total_fases || 0;
            if (modulo.fase_atual) {
                progresso.textContent = `Fase ${modulo.fase_atual.numero_fase}/${total} • ${concluidas} concluídas`;
            } else {
                progresso.textContent = `${concluidas}/${total} fases`;
            }

            const estadoModulo = document.createElement("small");
            if (modulo.concluido) {
                estadoModulo.textContent = "Concluído";
            } else if (estaEscolhido) {
                estadoModulo.textContent = "Módulo atual";
            } else if (bloqueado) {
                estadoModulo.textContent = "Bloqueado até concluir o módulo anterior";
            } else {
                estadoModulo.textContent = "Liberado";
            }

            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "btn ghost compact";
            botao.textContent = modulo.concluido ? "Concluído" : (estaEscolhido ? "Continuar" : "Escolher módulo");
            botao.disabled = total === 0 || bloqueado;
            botao.onclick = estaEscolhido
                ? () => iniciarModulo(modulo.id)
                : () => escolherModulo(modulo.id).then(() => iniciarModulo(modulo.id));

            card.append(titulo, descricao, progresso, estadoModulo, botao);
            modulesList.appendChild(card);
        });
    }

    async function escolherModulo(moduloId) {
        try {
            const dados = await api("/api/escolher-modulo", {
                method: "POST",
                body: JSON.stringify({ modulo_id: moduloId }),
            });
            atualizarJogador(dados.jogador);
            await carregarMenu();
        } catch (erro) {
            mostrarModal("Módulo bloqueado", erro.message, "Continuar", fecharModal);
        }
    }

    async function iniciarModulo(moduloId) {
        // Se o jogador tem uma fase_atual_id salva para este módulo, retoma de onde parou
        const moduloInfo = estado.menu && estado.menu.modulos
            ? estado.menu.modulos.find((m) => Number(m.id) === Number(moduloId))
            : null;

        if (moduloInfo && moduloInfo.concluido) {
            mostrarModal(
                "Módulo concluído",
                "Você já concluiu este módulo. Escolha o próximo módulo liberado para continuar.",
                "Voltar ao menu",
                carregarMenu
            );
            return;
        }

        if (moduloInfo && moduloInfo.fase_atual && moduloInfo.fase_atual.id) {
            await carregarFase(moduloInfo.fase_atual.id);
            return;
        }

        // Fallback: busca a próxima fase em ordem (primeira não concluída/pulada, respeitando a ordem)
        const dados = await api(`/api/fases?modulo_id=${encodeURIComponent(moduloId)}`);
        const fase = dados.fases.find((item) => item.progresso !== "concluida" && item.progresso !== "pulada") || dados.fases[0];
        if (fase) {
            await carregarFase(fase.id);
        }
    }

    async function carregarFase(faseId) {
        const dados = await api(`/api/fase?id=${encodeURIComponent(faseId)}`);
        estado.fase = dados.fase;
        estado.tempoRestante = dados.fase.tempo_limite;
        estado.linhaSelecionada = null;
        estado.usouDica = false;
        estado.dicasUsadas = 0;

        levelTitle.textContent = dados.fase.titulo;
        levelDescription.textContent = dados.fase.descricao;
        levelMeta.textContent = `Recompensa: ${dados.fase.recompensa_moedas} moedas`;
        hintBox.classList.add("hidden");
        hintBox.textContent = "";

        renderizarLinhas(dados.fase.linhas_codigo);
        mostrarMensagemEdicao("");
        atualizarTimer();
        atualizarBotaoTempo();
        iniciarTimer();
        atualizarJogador(estado.jogador);
        mostrarTela("jogo");
    }

    function renderizarLinhas(linhas) {
        sourceLines.innerHTML = "";
        solutionArea.innerHTML = '<p class="placeholder-text">Clique ou arraste as linhas para cá.</p>';

        const embaralhadas = linhas
            .map((texto, indiceOriginal) => ({ texto, indiceOriginal }))
            .sort(() => Math.random() - 0.5);

        embaralhadas.forEach((linha) => {
            sourceLines.appendChild(criarLinhaCodigo(linha.texto, linha.indiceOriginal));
        });
    }

    function criarLinhaCodigo(texto, indiceOriginal) {
        const div = document.createElement("div");
        div.className = "code-line";
        div.textContent = texto;
        div.draggable = true;
        div.tabIndex = 0;
        div.dataset.index = String(indiceOriginal);

        div.addEventListener("dragstart", (evento) => {
            div.classList.add("dragging");
            evento.dataTransfer.setData("text/plain", div.dataset.index);
        });
        div.addEventListener("dragend", () => {
            div.classList.remove("dragging");
            if (div.parentElement === solutionArea) selecionarLinha(div);
        });
        div.addEventListener("click", () => lidarCliqueLinha(div));
        div.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                lidarCliqueLinha(div);
            }
        });

        return div;
    }

    function lidarCliqueLinha(linha) {
        if (linha.parentElement === sourceLines) {
            moverParaSolucao(linha);
            selecionarLinha(linha);
            return;
        }
        selecionarLinha(linha);
    }

    function moverParaSolucao(linha) {
        const placeholder = solutionArea.querySelector(".placeholder-text");
        if (placeholder) placeholder.remove();
        solutionArea.appendChild(linha);
    }

    function moverParaOrigem(linha) {
        sourceLines.appendChild(linha);
        limparSelecaoLinha();
        if (solutionArea.querySelectorAll(".code-line").length === 0) {
            solutionArea.innerHTML = '<p class="placeholder-text">Clique ou arraste as linhas para cá.</p>';
        }
    }

    function selecionarLinha(linha) {
        document.querySelectorAll(".code-line.selected").forEach((el) => el.classList.remove("selected"));
        estado.linhaSelecionada = linha;
        linha.classList.add("selected");
        mostrarMensagemEdicao("");
    }

    function limparSelecaoLinha() {
        if (estado.linhaSelecionada) {
            estado.linhaSelecionada.classList.remove("selected");
        }
        estado.linhaSelecionada = null;
    }

    function moverLinhaSelecionada(direcao) {
        const linha = estado.linhaSelecionada;
        if (!linha || linha.parentElement !== solutionArea) {
            mostrarMensagemEdicao("Selecione uma linha na area de solucao primeiro.");
            return;
        }

        const linhas = [...solutionArea.querySelectorAll(".code-line")];
        const indice = linhas.indexOf(linha);
        if (indice === -1) return;

        if (direcao === "cima" && indice > 0) {
            solutionArea.insertBefore(linha, linhas[indice - 1]);
        }
        if (direcao === "baixo" && indice < linhas.length - 1) {
            solutionArea.insertBefore(linhas[indice + 1], linha);
        }
        selecionarLinha(linha);
    }

    function mostrarMensagemEdicao(texto) {
        editMessage.textContent = texto;
    }

    solutionArea.addEventListener("dragover", (evento) => {
        evento.preventDefault();
        const dragging = document.querySelector(".dragging");
        if (!dragging) return;
        const afterElement = getDragAfterElement(solutionArea, evento.clientY);
        const placeholder = solutionArea.querySelector(".placeholder-text");
        if (placeholder) placeholder.remove();
        if (!afterElement) {
            solutionArea.appendChild(dragging);
        } else {
            solutionArea.insertBefore(dragging, afterElement);
        }
    });

    sourceLines.addEventListener("dragover", (evento) => {
        evento.preventDefault();
        const dragging = document.querySelector(".dragging");
        if (!dragging) return;
        sourceLines.appendChild(dragging);
        limparSelecaoLinha();
        if (solutionArea.querySelectorAll(".code-line").length === 0) {
            solutionArea.innerHTML = '<p class="placeholder-text">Clique ou arraste as linhas para cá.</p>';
        }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll(".code-line:not(.dragging)")];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            }
            return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function iniciarTimer() {
        limparTimer();
        estado.intervaloTimer = setInterval(async () => {
            estado.tempoRestante -= 1;
            atualizarTimer();
            if (estado.tempoRestante <= 0) {
                limparTimer();
                await registrarFalhaTempo();
            }
        }, 1000);
    }

    function limparTimer() {
        if (estado.intervaloTimer) {
            clearInterval(estado.intervaloTimer);
            estado.intervaloTimer = null;
        }
    }

    function atualizarTimer() {
        const minutos = Math.floor(estado.tempoRestante / 60);
        const segundos = estado.tempoRestante % 60;
        timerDisplay.textContent = `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
        timerDisplay.dataset.danger = estado.tempoRestante <= 10 ? "true" : "false";
        atualizarBotaoTempo();
    }

    function atualizarBotaoTempo() {
        if (!btnBuyTime) return;
        const podeComprar = Boolean(estado.fase) && estado.tempoRestante <= 20 && estado.tempoRestante > 0;
        btnBuyTime.disabled = !podeComprar;
        btnBuyTime.title = podeComprar
            ? "Comprar mais 40 segundos"
            : "Disponível quando restarem 20 segundos ou menos";
    }

    async function registrarFalhaTempo() {
        let dados = null;
        try {
            dados = await api("/api/falha", {
                method: "POST",
                body: JSON.stringify({ fase_id: estado.fase.id, motivo: "tempo_esgotado" }),
            });
            atualizarJogador(dados.jogador);
        } catch (erro) {
            console.error(erro);
        }
        if (dados && dados.vidas_esgotadas) {
            mostrarModal(
                "Sem vidas",
                "Você não tem mais vidas. Suas moedas e pontos foram zerados e você terá que refazer o módulo.",
                "OK",
                carregarMenu
            );
            return;
        }
        mostrarModal("Tempo esgotado", "Você perdeu uma vida. Reorganize a estratégia e tente novamente.", "Reiniciar fase", () => carregarFase(estado.fase.id));
    }

    async function verificarResposta() {
        if (!estado.fase) return;

        const ordem = [...solutionArea.querySelectorAll(".code-line")].map((linha) => Number(linha.dataset.index));
        if (ordem.length !== estado.fase.ordem_correta.length) {
            mostrarModal("Solução incompleta", "Use todas as linhas antes de verificar.", "Continuar", fecharModal);
            return;
        }

        limparTimer();
        try {
            const dados = await api("/api/verificar", {
                method: "POST",
                body: JSON.stringify({
                    fase_id: estado.fase.id,
                    ordem,
                    tempo_restante: estado.tempoRestante,
                    usou_dica: estado.usouDica,
                    dicas_usadas: estado.dicasUsadas,
                }),
            });
            atualizarJogador(dados.jogador);

            if (dados.acertou) {
                const extra = `+${dados.pontos_ganhos} pontos | +${dados.moedas_ganhas} moedas\n\n${dados.explicacao || ""}`;
                const tituloSucesso = dados.modulo_concluido ? "Módulo concluído" : "Correto";
                const mensagemSucesso = dados.modulo_concluido
                    ? (dados.modulo_liberado
                        ? `Você concluiu as 10 fases e liberou o ${dados.modulo_liberado.titulo}.`
                        : "Você concluiu todas as fases deste módulo.")
                    : "Você organizou o código perfeitamente.";
                const textoBotao = dados.modulo_concluido && !dados.proxima_fase ? "Voltar ao menu" : "Próxima fase";
                mostrarModal(tituloSucesso, mensagemSucesso, textoBotao, () => {
                    fecharModal();
                    if (dados.proxima_fase) {
                        carregarFase(dados.proxima_fase.id);
                    } else {
                        carregarMenu();
                    }
                }, extra);
            } else {
                if (dados.vidas_esgotadas || dados.vidas_restantes === 0) {
                    mostrarModal(
                        "Sem vidas",
                        "Você não tem mais vidas. Suas moedas e pontos foram zerados e você terá que refazer o módulo.",
                        "OK",
                        carregarMenu
                    );
                } else {
                    mostrarModal("Incorreto", `Você perdeu uma vida. Vidas restantes: ${dados.vidas_restantes}.`, "Tentar novamente", () => carregarFase(estado.fase.id));
                }
            }
        } catch (erro) {
            mostrarModal("Erro", erro.message, "Continuar", () => {
                fecharModal();
                iniciarTimer();
            });
        }
    }

    function custoDicaAtual() {
        return [10, 15, 20, 30, 45][estado.dicasUsadas] || 45;
    }

    async function comprarDica() {
        if (!estado.fase) return;
        if (estado.dicasUsadas >= 5) {
            mostrarModal("Limite de dicas", "Você já usou as 5 dicas disponíveis nesta fase.", "Continuar", fecharModal);
            return;
        }
        const custo = custoDicaAtual();
        mostrarConfirmacao(
            "Comprar dica",
            `Esta dica custa ${custo} moedas. Você tem ${estado.jogador.moedas} moedas. Cada nova dica fica mais fácil e mais cara.`,
            "Comprar",
            "Cancelar",
            () => confirmarCompraDica(custo)
        );
    }

    function confirmarCompraDica(custo) {
        mostrarConfirmacao(
            "Confirmar compra",
            `Tem certeza que deseja gastar ${custo} moedas nesta dica?`,
            "Sim, comprar",
            "Cancelar",
            executarCompraDica
        );
    }

    async function executarCompraDica() {
        try {
            const dados = await api("/api/dica", {
                method: "POST",
                body: JSON.stringify({ fase_id: estado.fase.id, numero_dica: estado.dicasUsadas + 1 }),
            });
            estado.usouDica = true;
            estado.dicasUsadas = dados.dicas_usadas;
            atualizarJogador(dados.jogador);
            hintBox.textContent = `Dica ${dados.dicas_usadas}/5: ${dados.dica}`;
            hintBox.classList.remove("hidden");
        } catch (erro) {
            mostrarModal("Dica indisponível", erro.message, "Continuar", fecharModal);
        }
    }

    async function comprarVida() {
        mostrarConfirmacao(
            "Comprar vida",
            `Cada vida custa 25 moedas. Você tem ${estado.jogador.moedas} moedas e ${estado.jogador.vidas} vidas.`,
            "Comprar",
            "Cancelar",
            () => mostrarConfirmacao("Confirmar compra", "Tem certeza que deseja comprar 1 vida?", "Sim, comprar", "Cancelar", executarCompraVida)
        );
    }

    async function executarCompraVida() {
        try {
            const dados = await api("/api/comprar-vida", { method: "POST", body: "{}" });
            atualizarJogador(dados.jogador);
            mostrarModal("Vida comprada", `Você gastou ${dados.custo} moedas e ganhou 1 vida.`, "Continuar", fecharModal);
        } catch (erro) {
            mostrarModal("Compra não concluída", erro.message, "Continuar", fecharModal);
        }
    }

    async function comprarTempo() {
        if (!estado.fase) return;
        if (estado.tempoRestante > 20) {
            mostrarModal("Tempo ainda disponível", "Só é possível comprar mais tempo quando restarem 20 segundos ou menos.", "Continuar", fecharModal);
            return;
        }
        if (estado.tempoRestante <= 0) return;
        mostrarConfirmacao(
            "Comprar tempo",
            `Comprar mais 40 segundos custa 20 moedas. Você tem ${estado.jogador.moedas} moedas.`,
            "Comprar",
            "Cancelar",
            executarCompraTempo
        );
    }

    async function executarCompraTempo() {
        try {
            const dados = await api("/api/comprar-tempo", {
                method: "POST",
                body: JSON.stringify({ fase_id: estado.fase.id, tempo_restante: estado.tempoRestante }),
            });
            estado.tempoRestante += dados.tempo_adicionado;
            atualizarJogador(dados.jogador);
            atualizarTimer();
            mostrarModal("Tempo comprado", `Você ganhou mais ${dados.tempo_adicionado} segundos.`, "Continuar", fecharModal);
        } catch (erro) {
            mostrarModal("Compra não concluída", erro.message, "Continuar", fecharModal);
        }
    }

    async function pularFase() {
        if (!estado.fase) return;
        mostrarConfirmacao(
            "Pular fase",
            "Pular esta fase custa 30 moedas e também remove 50 pontos da sua pontuação. Deseja continuar?",
            "Pular fase",
            "Cancelar",
            executarPuloFase
        );
    }

    async function executarPuloFase() {
        try {
            limparTimer();
            const dados = await api("/api/pular-fase", {
                method: "POST",
                body: JSON.stringify({ fase_id: estado.fase.id }),
            });
            atualizarJogador(dados.jogador);
            if (dados.proxima_fase) {
                await carregarFase(dados.proxima_fase.id);
            } else {
                await carregarMenu();
            }
        } catch (erro) {
            mostrarModal("Não deu para pular", erro.message, "Continuar", () => {
                fecharModal();
                iniciarTimer();
            });
        }
    }

    function mostrarModal(titulo, mensagem, textoBotao, acao, extra = "") {
        modalTitle.textContent = titulo;
        modalMessage.textContent = mensagem;
        modalBtn.textContent = textoBotao;
        modalCancelBtn.classList.add("hidden");
        modalBtn.classList.remove("hidden");
        modalBtn.onclick = () => {
            fecharModal();
            if (acao) acao();
        };
        if (extra) {
            modalExtra.textContent = extra;
            modalExtra.classList.remove("hidden");
        } else {
            modalExtra.textContent = "";
            modalExtra.classList.add("hidden");
        }
        modalOverlay.classList.remove("hidden");
    }

    function mostrarConfirmacao(titulo, mensagem, textoConfirmar, textoCancelar, acaoConfirmar) {
        modalTitle.textContent = titulo;
        modalMessage.textContent = mensagem;
        modalExtra.textContent = "";
        modalExtra.classList.add("hidden");
        modalCancelBtn.textContent = textoCancelar;
        modalBtn.textContent = textoConfirmar;
        modalCancelBtn.classList.remove("hidden");
        modalBtn.classList.remove("hidden");
        modalCancelBtn.onclick = fecharModal;
        modalBtn.onclick = () => {
            fecharModal();
            acaoConfirmar();
        };
        modalOverlay.classList.remove("hidden");
    }

    function fecharModal() {
        modalOverlay.classList.add("hidden");
    }

    authForm.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        definirMensagem(authMessage, "");
        let autenticado = false;
        try {
            const dados = await api("/api/login", {
                method: "POST",
                body: JSON.stringify({
                    email: authEmail.value,
                    senha: authPassword.value,
                }),
            });
            atualizarJogador(dados.jogador);
            autenticado = true;
            await carregarMenu();
        } catch (erro) {
            if (autenticado) {
                mostrarModal("Erro ao carregar menu", erro.message, "Continuar", fecharModal);
            } else {
                definirMensagem(authMessage, erro.message, "erro");
            }
        }
    });

    btnRegister.addEventListener("click", async () => {
        definirMensagem(authMessage, "");
        let autenticado = false;
        try {
            const dados = await api("/api/cadastro", {
                method: "POST",
                body: JSON.stringify({
                    nome: authName.value,
                    email: authEmail.value,
                    senha: authPassword.value,
                }),
            });
            atualizarJogador(dados.jogador);
            autenticado = true;
            await carregarMenu();
        } catch (erro) {
            if (autenticado) {
                mostrarModal("Erro ao carregar menu", erro.message, "Continuar", fecharModal);
            } else {
                definirMensagem(authMessage, erro.message, "erro");
            }
        }
    });

    btnLogout.addEventListener("click", async () => {
        await api("/api/logout", { method: "POST", body: "{}" });
        estado.jogador = null;
        mostrarTela("auth");
    });

    btnBackPrevious.addEventListener("click", voltarTelaAnterior);
    btnBackMenu.addEventListener("click", carregarMenu);
    btnHint.addEventListener("click", comprarDica);
    btnBuyTime.addEventListener("click", comprarTempo);
    btnBuyLife.addEventListener("click", comprarVida);
    btnSkip.addEventListener("click", pularFase);
    btnLineUp.addEventListener("click", () => moverLinhaSelecionada("cima"));
    btnLineDown.addEventListener("click", () => moverLinhaSelecionada("baixo"));
    btnLineRemove.addEventListener("click", () => {
        if (estado.linhaSelecionada && estado.linhaSelecionada.parentElement === solutionArea) {
            moverParaOrigem(estado.linhaSelecionada);
        } else {
            mostrarMensagemEdicao("Selecione uma linha na area de solucao primeiro.");
        }
    });
    btnReset.addEventListener("click", () => carregarFase(estado.fase.id));
    btnVerify.addEventListener("click", verificarResposta);

    iniciar();
});
