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

    async function api(caminho, opcoes = {}) {
        const resposta = await fetch(caminho, {
            headers: { "Content-Type": "application/json" },
            ...opcoes,
        });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) {
            throw new Error(dados.erro || "Não foi possível concluir a ação.");
        }
        return dados;
    }

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
            definirMensagem(authMessage, erro.message, "erro");
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
        try {
            const dados = await api("/api/login", {
                method: "POST",
                body: JSON.stringify({
                    email: authEmail.value,
                    senha: authPassword.value,
                }),
            });
            atualizarJogador(dados.jogador);
            await carregarMenu();
        } catch (erro) {
            definirMensagem(authMessage, erro.message, "erro");
        }
    });

    btnRegister.addEventListener("click", async () => {
        definirMensagem(authMessage, "");
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
            await carregarMenu();
        } catch (erro) {
            definirMensagem(authMessage, erro.message, "erro");
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
