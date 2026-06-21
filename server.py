# -*- coding: utf-8 -*-
import hashlib
import http.cookies
import http.server
import json
import os
import re
import secrets
import socketserver
import sqlite3
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse


PORTA = 8000
CAMINHO_BANCO = "database.db"
CUSTOS_DICA = [10, 15, 20, 30, 45]
CUSTO_PULAR_FASE = 30
CUSTO_VIDA = 25
CUSTO_TEMPO = 20
BONUS_TEMPO = 40
LIMITE_COMPRA_TEMPO = 20
VIDAS_INICIAIS = 5
MOEDAS_INICIAIS = 50


def agora_iso():
    return datetime.utcnow().isoformat(timespec="seconds")


def conectar_banco():
    conexao = sqlite3.connect(CAMINHO_BANCO)
    conexao.row_factory = sqlite3.Row
    return conexao


def responder_json(handler, dados, status=200):
    corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(corpo)))
    handler.end_headers()
    handler.wfile.write(corpo)


def ler_json(handler):
    tamanho = int(handler.headers.get("Content-Length", 0))
    if tamanho == 0:
        return {}
    corpo = handler.rfile.read(tamanho).decode("utf-8")
    return json.loads(corpo or "{}")


def criar_hash_senha(senha, sal=None):
    sal = sal or secrets.token_hex(16)
    senha_hash = hashlib.pbkdf2_hmac(
        "sha256",
        senha.encode("utf-8"),
        sal.encode("utf-8"),
        120000,
    ).hex()
    return f"{sal}${senha_hash}"


def senha_confere(senha, senha_salva):
    try:
        sal, senha_hash = senha_salva.split("$", 1)
    except ValueError:
        return False
    return secrets.compare_digest(criar_hash_senha(senha, sal), f"{sal}${senha_hash}")


def normalizar_email(email):
    return (email or "").strip().lower()


def linha_para_dict(linha):
    return dict(linha) if linha else None


def jogador_publico(jogador):
    if not jogador:
        return None
    return {
        "id": jogador["id"],
        "nome": jogador["nome"],
        "email": jogador["email"],
        "pontos": jogador["pontos"],
        "moedas": jogador["moedas"],
        "vidas": jogador["vidas"],
        "nivel_habilidade": jogador["nivel_habilidade"],
        "fase_atual_id": jogador["fase_atual_id"],
        "modulo_escolhido_id": jogador["modulo_escolhido_id"],
    }


def calcular_nivel_alvo(jogador):
    return max(1, min(10, int(jogador["nivel_habilidade"] or 1)))


def buscar_proxima_fase(conexao, jogador):
    fase_atual_id = jogador["fase_atual_id"]
    modulo_escolhido_id = jogador["modulo_escolhido_id"]

    if not modulo_escolhido_id:
        return None

    if fase_atual_id:
        fase = conexao.execute(
            "SELECT * FROM fases WHERE id = ? AND modulo_id = ? AND status = 'publicada'",
            (fase_atual_id, modulo_escolhido_id),
        ).fetchone()
        progresso = conexao.execute(
            """
            SELECT status FROM progresso_jogador
            WHERE jogador_id = ? AND fase_id = ?
            """,
            (jogador["id"], fase_atual_id),
        ).fetchone()
        if fase and (not progresso or progresso["status"] not in ("concluida", "pulada")):
            return fase

    andamento = conexao.execute(
        """
        SELECT f.*
        FROM fases f
        JOIN progresso_jogador p ON p.fase_id = f.id AND p.jogador_id = ?
        WHERE f.status = 'publicada'
          AND f.modulo_id = ?
          AND p.status = 'em_andamento'
        ORDER BY p.id DESC
        LIMIT 1
        """,
        (jogador["id"], modulo_escolhido_id),
    ).fetchone()
    if andamento:
        conexao.execute(
            "UPDATE jogadores SET fase_atual_id = ? WHERE id = ?",
            (andamento["id"], jogador["id"]),
        )
        return andamento

    fase = conexao.execute(
        """
        SELECT f.*
        FROM fases f
        LEFT JOIN progresso_jogador p
            ON p.fase_id = f.id AND p.jogador_id = ?
        WHERE f.status = 'publicada'
          AND f.modulo_id = ?
          AND (p.status IS NULL OR p.status NOT IN ('concluida', 'pulada'))
        ORDER BY f.ordem, f.id
        LIMIT 1
        """,
        (jogador["id"], modulo_escolhido_id),
    ).fetchone()

    if fase:
        conexao.execute(
            "UPDATE jogadores SET fase_atual_id = ? WHERE id = ?",
            (fase["id"], jogador["id"]),
        )
    return fase



def modulos_liberados(conexao, jogador_id):
    modulos = conexao.execute(
        "SELECT id, linguagem, ordem FROM modulos ORDER BY linguagem, ordem, id"
    ).fetchall()
    liberados = set()
    por_linguagem = {}
    for modulo in modulos:
        por_linguagem.setdefault(modulo["linguagem"], []).append(modulo)

    for _, itens in por_linguagem.items():
        anterior_concluido = True
        for modulo in itens:
            if anterior_concluido:
                liberados.add(modulo["id"])
            total = conexao.execute(
                "SELECT COUNT(*) AS total FROM fases WHERE modulo_id = ? AND status = 'publicada'",
                (modulo["id"],),
            ).fetchone()["total"]
            concluidas = conexao.execute(
                """
                SELECT COUNT(*) AS total
                FROM fases f
                JOIN progresso_jogador p ON p.fase_id = f.id AND p.jogador_id = ?
                WHERE f.modulo_id = ? AND f.status = 'publicada' AND p.status = 'concluida'
                """,
                (jogador_id, modulo["id"]),
            ).fetchone()["total"]
            anterior_concluido = total > 0 and concluidas >= total
    return liberados


def modulo_concluido(conexao, jogador_id, modulo_id):
    total = conexao.execute(
        "SELECT COUNT(*) AS total FROM fases WHERE modulo_id = ? AND status = 'publicada'",
        (modulo_id,),
    ).fetchone()["total"]
    if total == 0:
        return False
    concluidas = conexao.execute(
        """
        SELECT COUNT(*) AS total
        FROM fases f
        JOIN progresso_jogador p ON p.fase_id = f.id AND p.jogador_id = ?
        WHERE f.modulo_id = ? AND f.status = 'publicada' AND p.status = 'concluida'
        """,
        (jogador_id, modulo_id),
    ).fetchone()["total"]
    return concluidas >= total


def proximo_modulo_liberado(conexao, jogador_id, modulo_atual_id):
    atual = conexao.execute("SELECT linguagem, ordem FROM modulos WHERE id = ?", (modulo_atual_id,)).fetchone()
    if not atual or not modulo_concluido(conexao, jogador_id, modulo_atual_id):
        return None
    return conexao.execute(
        "SELECT id, titulo FROM modulos WHERE linguagem = ? AND ordem > ? ORDER BY ordem, id LIMIT 1",
        (atual["linguagem"], atual["ordem"]),
    ).fetchone()


def fase_atual_resumo(conexao, fase):
    if not fase:
        return None

    numero_fase = conexao.execute(
        """
        SELECT COUNT(*) AS total
        FROM fases
        WHERE modulo_id = ?
          AND status = 'publicada'
          AND (ordem < ? OR (ordem = ? AND id <= ?))
        """,
        (fase["modulo_id"], fase["ordem"], fase["ordem"], fase["id"]),
    ).fetchone()["total"]

    return {
        "id": fase["id"],
        "titulo": fase["titulo"],
        "numero_fase": numero_fase,
    }

def fase_para_retomada(conexao, jogador_id, modulo_id):
    andamento = conexao.execute(
        """
        SELECT f.*
        FROM fases f
        JOIN progresso_jogador p ON p.fase_id = f.id AND p.jogador_id = ?
        WHERE f.modulo_id = ?
          AND f.status = 'publicada'
          AND p.status = 'em_andamento'
        ORDER BY p.id DESC
        LIMIT 1
        """,
        (jogador_id, modulo_id),
    ).fetchone()
    if andamento:
        return andamento

    return conexao.execute(
        """
        SELECT f.*
        FROM fases f
        LEFT JOIN progresso_jogador p ON p.fase_id = f.id AND p.jogador_id = ?
        WHERE f.modulo_id = ?
          AND f.status = 'publicada'
          AND (p.status IS NULL OR p.status NOT IN ('concluida', 'pulada'))
        ORDER BY f.ordem, f.id
        LIMIT 1
        """,
        (jogador_id, modulo_id),
    ).fetchone()


def status_linguagens(conexao, jogador_id):
    linguagens = ["Java", "Python", "JavaScript", "C#"]
    liberados = modulos_liberados(conexao, jogador_id)
    status = []
    for linguagem in linguagens:
        modulos = conexao.execute(
            "SELECT * FROM modulos WHERE linguagem = ? ORDER BY ordem, id",
            (linguagem,),
        ).fetchall()
        if not modulos:
            continue

        total_fases = 0
        concluidas_total = 0
        modulo_retomada = None
        fase_retomada = None
        modulos_status = []

        for modulo in modulos:
            total = conexao.execute(
                "SELECT COUNT(*) AS total FROM fases WHERE modulo_id = ? AND status = 'publicada'",
                (modulo["id"],),
            ).fetchone()["total"]
            concluidas = conexao.execute(
                """
                SELECT COUNT(*) AS total
                FROM fases f
                JOIN progresso_jogador p ON p.fase_id = f.id AND p.jogador_id = ?
                WHERE f.modulo_id = ? AND f.status = 'publicada' AND p.status = 'concluida'
                """,
                (jogador_id, modulo["id"]),
            ).fetchone()["total"]
            total_fases += total
            concluidas_total += concluidas

            liberado = modulo["id"] in liberados
            concluido = total > 0 and concluidas >= total
            fase_modulo = fase_para_retomada(conexao, jogador_id, modulo["id"]) if liberado and not concluido else None
            fase_info = fase_atual_resumo(conexao, fase_modulo) if fase_modulo else None
            if not fase_retomada and fase_modulo:
                modulo_retomada = modulo
                fase_retomada = fase_modulo

            modulos_status.append({
                "id": modulo["id"],
                "titulo": modulo["titulo"],
                "slug": modulo["slug"],
                "descricao": modulo["descricao"],
                "linguagem": modulo["linguagem"],
                "ordem": modulo["ordem"],
                "total_fases": total,
                "fases_concluidas": concluidas,
                "liberado": liberado,
                "concluido": concluido,
                "fase_atual": fase_info,
            })

        percentual = round((concluidas_total / total_fases) * 100) if total_fases else 0
        status.append({
            "linguagem": linguagem,
            "percentual": percentual,
            "total_fases": total_fases,
            "fases_concluidas": concluidas_total,
            "modulo_retomada_id": modulo_retomada["id"] if modulo_retomada else None,
            "fase_retomada_id": fase_retomada["id"] if fase_retomada else None,
            "modulos": modulos_status,
        })
    return status


def marcar_fase_em_andamento(conexao, jogador_id, fase_id):
    atual = conexao.execute(
        "SELECT id, status FROM progresso_jogador WHERE jogador_id = ? AND fase_id = ?",
        (jogador_id, fase_id),
    ).fetchone()
    if atual:
        if atual["status"] not in ("concluida", "pulada"):
            conexao.execute(
                "UPDATE progresso_jogador SET status = 'em_andamento' WHERE id = ?",
                (atual["id"],),
            )
    else:
        conexao.execute(
            """
            INSERT INTO progresso_jogador
                (jogador_id, fase_id, status, tentativas, melhor_pontuacao, concluida_em)
            VALUES (?, ?, 'em_andamento', 0, 0, NULL)
            """,
            (jogador_id, fase_id),
        )


def validar_ordem_fase(fase, ordem):
    try:
        ordem = [int(item) for item in ordem]
    except (TypeError, ValueError):
        return False

    ordem_correta = json.loads(fase["ordem_correta"])
    ordem_correta = [int(item) for item in ordem_correta]
    if ordem == ordem_correta:
        return True

    if validar_ordem_por_dependencias(fase, ordem):
        return True

    titulo = (fase["titulo"] or "").lower()
    if titulo == "java 03 - soma":
        return len(ordem) == 4 and set(ordem[:2]) == {0, 1} and ordem[2:] == [2, 3]

    if titulo == "java 07 - while":
        return ordem == [0, 1, 2, 3, 4]

    return False


def validar_ordem_por_dependencias(fase, ordem):
    try:
        linhas = json.loads(fase["linhas_codigo"])
    except (TypeError, json.JSONDecodeError):
        return False

    if len(ordem) != len(linhas) or sorted(ordem) != list(range(len(linhas))):
        return False

    def sem_texto(linha):
        return re.sub(r'"[^"]*"|\'[^\']*\'', "", linha)

    def nome_declarado(linha):
        limpa = sem_texto(linha).strip()
        padroes = [
            r"^(?:int|double|float|boolean|bool|string|String|const|let|var)\s+([A-Za-z_]\w*)\s*=",
            r"^([A-Za-z_]\w*)\s*=",
        ]
        for padrao in padroes:
            achado = re.match(padrao, limpa)
            if achado:
                return achado.group(1)
        return None

    bloqueios = ("if ", "if(", "for ", "for(", "while ", "while(", "def ", "function ", "static ", "return", "else", "}", "{")
    if any(sem_texto(linha).strip().startswith(bloqueios) for linha in linhas):
        return False

    declaradas_por_linha = [nome_declarado(linha) for linha in linhas]
    variaveis_do_exercicio = {nome for nome in declaradas_por_linha if nome}
    ignorar = {
        "print", "console", "log", "System", "out", "println", "Console", "WriteLine",
        "int", "double", "float", "boolean", "bool", "string", "String", "const", "let", "var",
        "true", "false", "True", "False",
    }

    declaradas = set()
    for indice in ordem:
        linha = sem_texto(linhas[indice])
        declarada_agora = declaradas_por_linha[indice]
        usados = set(re.findall(r"[A-Za-z_]\w*", linha)) - ignorar
        if declarada_agora:
            usados.discard(declarada_agora)
        dependencias = usados & variaveis_do_exercicio
        if not dependencias.issubset(declaradas):
            return False
        if declarada_agora:
            declaradas.add(declarada_agora)

    return True


def reiniciar_modulo_do_jogador(conexao, jogador_id, modulo_id):
    fase_ids = [
        linha["id"]
        for linha in conexao.execute(
            "SELECT id FROM fases WHERE modulo_id = ? AND status = 'publicada'",
            (modulo_id,),
        ).fetchall()
    ]
    if fase_ids:
        marcadores = ",".join("?" for _ in fase_ids)
        conexao.execute(
            f"DELETE FROM progresso_jogador WHERE jogador_id = ? AND fase_id IN ({marcadores})",
            [jogador_id, *fase_ids],
        )
    conexao.execute(
        "UPDATE jogadores SET vidas = ?, fase_atual_id = NULL, pontos = 0, moedas = 0 WHERE id = ?",
        (VIDAS_INICIAIS, jogador_id),
    )


def registrar_transacao(conexao, jogador_id, tipo, valor, fase_id=None):
    conexao.execute(
        """
        INSERT INTO transacoes_moedas (jogador_id, fase_id, tipo, valor, criado_em)
        VALUES (?, ?, ?, ?, ?)
        """,
        (jogador_id, fase_id, tipo, valor, agora_iso()),
    )


def ajustar_habilidade(conexao, jogador_id):
    jogador = conexao.execute("SELECT * FROM jogadores WHERE id = ?", (jogador_id,)).fetchone()
    if not jogador:
        return

    ultimas = conexao.execute(
        """
        SELECT acertou, usou_dica, pulou
        FROM tentativas
        WHERE jogador_id = ?
        ORDER BY id DESC
        LIMIT 3
        """,
        (jogador_id,),
    ).fetchall()

    nivel = calcular_nivel_alvo(jogador)
    if len(ultimas) >= 3 and all(linha["acertou"] for linha in ultimas):
        nivel += 1
    elif len(ultimas) >= 2 and all(not linha["acertou"] for linha in ultimas[:2]):
        nivel -= 1

    nivel = max(1, min(10, nivel))
    conexao.execute(
        "UPDATE jogadores SET nivel_habilidade = ? WHERE id = ?",
        (nivel, jogador_id),
    )


class JogoHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        caminho = urlparse(self.path)
        if caminho.path == "/api/sessao":
            self.api_sessao()
        elif caminho.path == "/api/menu":
            self.api_menu()
        elif caminho.path == "/api/ranking":
            self.api_ranking()
        elif caminho.path == "/api/fases":
            self.api_fases(caminho.query)
        elif caminho.path == "/api/fase":
            self.api_fase(caminho.query)
        elif caminho.path == "/api/modulos":
            self.api_modulos()
        elif caminho.path == "/api/levels":
            self.api_fases_legado()
        elif caminho.path == "/api/level":
            self.api_fase_legado(caminho.query)
        else:
            super().do_GET()

    def do_POST(self):
        caminho = urlparse(self.path).path
        if caminho == "/api/cadastro":
            self.api_cadastro()
        elif caminho == "/api/login":
            self.api_login()
        elif caminho == "/api/logout":
            self.api_logout()
        elif caminho == "/api/verificar":
            self.api_verificar()
        elif caminho == "/api/falha":
            self.api_falha()
        elif caminho == "/api/dica":
            self.api_dica()
        elif caminho == "/api/pular-fase":
            self.api_pular_fase()
        elif caminho == "/api/comprar-vida":
            self.api_comprar_vida()
        elif caminho == "/api/comprar-tempo":
            self.api_comprar_tempo()
        elif caminho == "/api/escolher-modulo":
            self.api_escolher_modulo()

        else:
            responder_json(self, {"erro": "Rota não encontrada."}, 404)

    def jogador_atual(self):
        cookie = http.cookies.SimpleCookie(self.headers.get("Cookie"))
        token = cookie.get("sessao")
        if not token:
            return None

        with conectar_banco() as conexao:
            sessao = conexao.execute(
                """
                SELECT jogador_id FROM sessoes
                WHERE token = ? AND expira_em > ?
                """,
                (token.value, agora_iso()),
            ).fetchone()
            if not sessao:
                return None
            return conexao.execute(
                "SELECT * FROM jogadores WHERE id = ?",
                (sessao["jogador_id"],),
            ).fetchone()

    def exigir_jogador(self):
        jogador = self.jogador_atual()
        if not jogador:
            responder_json(self, {"erro": "Você precisa entrar com email para continuar."}, 401)
            return None
        return jogador

    def criar_sessao(self, jogador_id):
        token = secrets.token_urlsafe(32)
        expira_em = (datetime.utcnow() + timedelta(days=7)).isoformat(timespec="seconds")
        with conectar_banco() as conexao:
            conexao.execute(
                """
                INSERT INTO sessoes (token, jogador_id, criado_em, expira_em)
                VALUES (?, ?, ?, ?)
                """,
                (token, jogador_id, agora_iso(), expira_em),
            )
            conexao.commit()
        self.send_header("Set-Cookie", f"sessao={token}; Path=/; HttpOnly; SameSite=Lax")

    def encerrar_sessao(self):
        cookie = http.cookies.SimpleCookie(self.headers.get("Cookie"))
        token = cookie.get("sessao")
        if token:
            with conectar_banco() as conexao:
                conexao.execute("DELETE FROM sessoes WHERE token = ?", (token.value,))
                conexao.commit()
        self.send_header("Set-Cookie", "sessao=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")

    def api_sessao(self):
        jogador = self.jogador_atual()
        responder_json(self, {"jogador": jogador_publico(jogador)})

    def api_cadastro(self):
        dados = ler_json(self)
        nome = (dados.get("nome") or "").strip()
        email = normalizar_email(dados.get("email"))
        senha = dados.get("senha") or ""

        if len(nome) < 2 or "@" not in email or len(senha) < 4:
            responder_json(self, {"erro": "Informe nome, email válido e senha com pelo menos 4 caracteres."}, 400)
            return

        with conectar_banco() as conexao:
            existente = conexao.execute("SELECT id FROM jogadores WHERE email = ?", (email,)).fetchone()
            if existente:
                responder_json(self, {"erro": "Já existe jogador cadastrado com este email."}, 409)
                return

            cursor = conexao.execute(
                """
                INSERT INTO jogadores
                    (nome, email, senha_hash, pontos, moedas, vidas, nivel_habilidade,
                     fase_atual_id, modulo_escolhido_id, criado_em)
                VALUES (?, ?, ?, 0, ?, ?, 1, NULL, NULL, ?)
                """,
                (nome, email, criar_hash_senha(senha), MOEDAS_INICIAIS, VIDAS_INICIAIS, agora_iso()),
            )
            jogador_id = cursor.lastrowid
            conexao.commit()

        jogador = self.buscar_jogador_por_id(jogador_id)
        corpo = json.dumps({"jogador": jogador_publico(jogador)}, ensure_ascii=False).encode("utf-8")
        self.send_response(201)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.criar_sessao(jogador_id)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def api_login(self):
        dados = ler_json(self)
        email = normalizar_email(dados.get("email"))
        senha = dados.get("senha") or ""

        with conectar_banco() as conexao:
            jogador = conexao.execute("SELECT * FROM jogadores WHERE email = ?", (email,)).fetchone()

        if not jogador or not senha_confere(senha, jogador["senha_hash"]):
            responder_json(self, {"erro": "Email ou senha inválidos."}, 401)
            return

        corpo = json.dumps({"jogador": jogador_publico(jogador)}, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.criar_sessao(jogador["id"])
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def api_logout(self):
        corpo = json.dumps({"ok": True}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.encerrar_sessao()
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def api_menu(self):
        jogador = self.exigir_jogador()
        if not jogador:
            return

        with conectar_banco() as conexao:
            fase_recomendada = buscar_proxima_fase(conexao, jogador)
            liberados = modulos_liberados(conexao, jogador["id"])
            modulos = conexao.execute(
                """
                SELECT
                    m.id,
                    m.titulo,
                    m.slug,
                    m.descricao,
                    m.linguagem,
                    m.ordem,
                    COUNT(f.id) AS total_fases,
                    SUM(CASE WHEN p.status = 'concluida' THEN 1 ELSE 0 END) AS fases_concluidas,
                    SUM(CASE WHEN p.status IN ('concluida', 'em_andamento', 'pulada') THEN 1 ELSE 0 END) AS fases_visitadas
                FROM modulos m
                LEFT JOIN fases f ON f.modulo_id = m.id AND f.status = 'publicada'
                LEFT JOIN progresso_jogador p ON p.fase_id = f.id AND p.jogador_id = ?
                GROUP BY m.id
                ORDER BY m.linguagem, m.ordem, m.id
                """,
                (jogador["id"],),
            ).fetchall()

            fase_atual_por_modulo = {}
            concluidos_por_modulo = {}
            for modulo in modulos:
                concluidos_por_modulo[modulo["id"]] = modulo_concluido(conexao, jogador["id"], modulo["id"])
                fase_modulo = fase_para_retomada(conexao, jogador["id"], modulo["id"])
                if fase_modulo:
                    fase_atual_por_modulo[modulo["id"]] = fase_atual_resumo(conexao, fase_modulo)

            linguagens = status_linguagens(conexao, jogador["id"])
            conexao.commit()

        responder_json(
            self,
            {
                "jogador": jogador_publico(self.buscar_jogador_por_id(jogador["id"])),
                "fase_recomendada": self.fase_resumo(fase_recomendada),
                "linguagens": linguagens,
                "modulos": [
                    dict(linha) | {
                        "liberado": linha["id"] in liberados,
                        "concluido": concluidos_por_modulo.get(linha["id"], False),
                        "fase_atual": fase_atual_por_modulo.get(linha["id"]),
                    }
                    for linha in modulos
                ],
                "ranking": self.buscar_ranking(),
            },
        )

    def api_ranking(self):
        responder_json(self, {"ranking": self.buscar_ranking()})

    def api_modulos(self):
        with conectar_banco() as conexao:
            modulos = conexao.execute(
                "SELECT id, titulo, slug, descricao, linguagem, ordem FROM modulos ORDER BY linguagem, ordem, id"
            ).fetchall()
        responder_json(self, {"modulos": [dict(linha) for linha in modulos]})

    def api_escolher_modulo(self):
        jogador = self.exigir_jogador()
        if not jogador:
            return

        dados = ler_json(self)
        modulo_id = dados.get("modulo_id")
        if not modulo_id:
            responder_json(self, {"erro": "Escolha uma linguagem para continuar."}, 400)
            return

        with conectar_banco() as conexao:
            modulo = conexao.execute("SELECT id, titulo FROM modulos WHERE id = ?", (modulo_id,)).fetchone()
            if not modulo:
                responder_json(self, {"erro": "Módulo inválido."}, 400)
                return
            if int(modulo_id) not in modulos_liberados(conexao, jogador["id"]):
                responder_json(self, {"erro": "Conclua o módulo anterior para liberar este módulo."}, 403)
                return

            if int(jogador["modulo_escolhido_id"] or 0) == int(modulo_id):
                conexao.execute(
                    "UPDATE jogadores SET modulo_escolhido_id = ? WHERE id = ?",
                    (modulo_id, jogador["id"]),
                )
            else:
                conexao.execute(
                    "UPDATE jogadores SET modulo_escolhido_id = ?, fase_atual_id = NULL WHERE id = ?",
                    (modulo_id, jogador["id"]),
                )
            conexao.commit()

        responder_json(self, {"jogador": jogador_publico(self.buscar_jogador_por_id(jogador["id"]))})

    def api_fases(self, query):
        parametros = parse_qs(query)
        modulo_id = parametros.get("modulo_id", [None])[0]
        jogador = self.jogador_atual()

        if jogador and modulo_id:
            with conectar_banco() as conexao_lock:
                if int(modulo_id) not in modulos_liberados(conexao_lock, jogador["id"]):
                    responder_json(self, {"erro": "Este módulo está bloqueado para o jogador atual."}, 403)
                    return

        sql = """
            SELECT f.id, f.modulo_id, f.titulo, f.descricao, f.dificuldade, f.tempo_limite,
                   f.recompensa_moedas, f.fonte, f.status, p.status AS progresso
            FROM fases f
            LEFT JOIN progresso_jogador p ON p.fase_id = f.id AND p.jogador_id = ?
            WHERE f.status = 'publicada'
        """
        valores = [jogador["id"] if jogador else None]
        if modulo_id:
            sql += " AND f.modulo_id = ?"
            valores.append(modulo_id)
        sql += " ORDER BY f.modulo_id, f.ordem, f.dificuldade, f.id"

        with conectar_banco() as conexao:
            fases = conexao.execute(sql, valores).fetchall()
        responder_json(self, {"fases": [dict(linha) for linha in fases]})

    def api_fase(self, query):
        parametros = parse_qs(query)
        fase_id = parametros.get("id", [None])[0]
        if not fase_id:
            responder_json(self, {"erro": "ID da fase é obrigatório."}, 400)
            return

        with conectar_banco() as conexao:
            fase = conexao.execute("SELECT * FROM fases WHERE id = ?", (fase_id,)).fetchone()

        if not fase:
            responder_json(self, {"erro": "Fase não encontrada."}, 404)
            return
        jogador = self.jogador_atual()
        if jogador:
            with conectar_banco() as conexao_lock:
                if int(fase["modulo_id"]) not in modulos_liberados(conexao_lock, jogador["id"]):
                    responder_json(self, {"erro": "Este módulo está bloqueado para o jogador atual."}, 403)
                    return
        # Salva a fase atual do jogador para retomar depois
        if jogador:
            with conectar_banco() as conexao_save:
                conexao_save.execute(
                    "UPDATE jogadores SET fase_atual_id = ?, modulo_escolhido_id = ? WHERE id = ?",
                    (fase["id"], fase["modulo_id"], jogador["id"]),
                )
                marcar_fase_em_andamento(conexao_save, jogador["id"], fase["id"])
                conexao_save.commit()
        responder_json(self, {"fase": self.fase_completa(fase)})

    def api_verificar(self):
        jogador = self.exigir_jogador()
        if not jogador:
            return

        dados = ler_json(self)
        fase_id = dados.get("fase_id")
        ordem = dados.get("ordem") or []
        tempo_restante = max(0, int(dados.get("tempo_restante") or 0))
        usou_dica = bool(dados.get("usou_dica"))

        with conectar_banco() as conexao:
            fase = conexao.execute("SELECT * FROM fases WHERE id = ?", (fase_id,)).fetchone()
            if not fase:
                responder_json(self, {"erro": "Fase não encontrada."}, 404)
                return
            if jogador["modulo_escolhido_id"] and int(fase["modulo_id"]) != int(jogador["modulo_escolhido_id"]):
                responder_json(self, {"erro": "Este módulo está bloqueado para o jogador atual."}, 403)
                return

            acertou = validar_ordem_fase(fase, ordem)
            pontos_ganhos = 0
            moedas_ganhas = 0
            vidas = jogador["vidas"]
            vidas_esgotadas = False

            if acertou:
                pontos_ganhos = 100 + tempo_restante * 10 + int(fase["dificuldade"]) * 20
                if usou_dica:
                    pontos_ganhos = max(50, pontos_ganhos - 50)
                moedas_ganhas = int(fase["recompensa_moedas"])

                conexao.execute(
                    """
                    UPDATE jogadores
                    SET pontos = pontos + ?,
                        moedas = moedas + ?,
                        fase_atual_id = NULL
                    WHERE id = ?
                    """,
                    (pontos_ganhos, moedas_ganhas, jogador["id"]),
                )
                registrar_transacao(conexao, jogador["id"], "recompensa_fase", moedas_ganhas, fase["id"])
                self.salvar_progresso(conexao, jogador["id"], fase["id"], "concluida", pontos_ganhos)
            else:
                vidas = max(0, jogador["vidas"] - 1)
                conexao.execute("UPDATE jogadores SET vidas = ? WHERE id = ?", (vidas, jogador["id"]))
                self.salvar_progresso(conexao, jogador["id"], fase["id"], "em_andamento", 0)
                vidas_esgotadas = vidas == 0

            conexao.execute(
                """
                INSERT INTO tentativas
                    (jogador_id, fase_id, acertou, tempo_restante, usou_dica, pulou, dificuldade_no_momento, criado_em)
                VALUES (?, ?, ?, ?, ?, 0, ?, ?)
                """,
                (jogador["id"], fase["id"], int(acertou), tempo_restante, int(usou_dica), fase["dificuldade"], agora_iso()),
            )
            ajustar_habilidade(conexao, jogador["id"])
            if vidas_esgotadas:
                reiniciar_modulo_do_jogador(conexao, jogador["id"], fase["modulo_id"])
            conexao.commit()

        jogador_atualizado = self.buscar_jogador_por_id(jogador["id"])
        with conectar_banco() as conexao:
            modulo_concluido_agora = modulo_concluido(conexao, jogador["id"], fase["modulo_id"]) if acertou else False
            modulo_liberado = linha_para_dict(proximo_modulo_liberado(conexao, jogador["id"], fase["modulo_id"])) if modulo_concluido_agora else None
        responder_json(
            self,
            {
                "acertou": acertou,
                "modulo_concluido": modulo_concluido_agora,
                "pontos_ganhos": pontos_ganhos,
                "moedas_ganhas": moedas_ganhas,
                "vidas_restantes": jogador_atualizado["vidas"],
                "vidas_esgotadas": vidas_esgotadas,
                "jogador": jogador_publico(jogador_atualizado),
                "explicacao": fase["explicacao"],
                "proxima_fase": self.buscar_fase_recomendada(jogador["id"]),
                "modulo_liberado": modulo_liberado,
            },
        )

    def api_falha(self):
        jogador = self.exigir_jogador()
        if not jogador:
            return

        dados = ler_json(self)
        fase_id = dados.get("fase_id")
        motivo = dados.get("motivo") or "falha"

        with conectar_banco() as conexao:
            fase = conexao.execute("SELECT * FROM fases WHERE id = ?", (fase_id,)).fetchone()
            if not fase:
                responder_json(self, {"erro": "Fase não encontrada."}, 404)
                return
            vidas = max(0, jogador["vidas"] - 1)
            conexao.execute("UPDATE jogadores SET vidas = ? WHERE id = ?", (vidas, jogador["id"]))
            vidas_esgotadas = vidas == 0
            self.salvar_progresso(conexao, jogador["id"], fase["id"], "em_andamento", 0)
            conexao.execute(
                """
                INSERT INTO tentativas
                    (jogador_id, fase_id, acertou, tempo_restante, usou_dica, pulou, dificuldade_no_momento, criado_em)
                VALUES (?, ?, 0, 0, 0, 0, ?, ?)
                """,
                (jogador["id"], fase["id"], fase["dificuldade"], agora_iso()),
            )
            ajustar_habilidade(conexao, jogador["id"])
            if vidas_esgotadas:
                reiniciar_modulo_do_jogador(conexao, jogador["id"], fase["modulo_id"])
            conexao.commit()

        responder_json(
            self,
            {
                "ok": True,
                "motivo": motivo,
                "vidas_esgotadas": vidas_esgotadas,
                "jogador": jogador_publico(self.buscar_jogador_por_id(jogador["id"])),
            },
        )

    def api_dica(self):
        jogador = self.exigir_jogador()
        if not jogador:
            return

        dados = ler_json(self)
        fase_id = dados.get("fase_id")
        numero_dica = max(1, min(5, int(dados.get("numero_dica") or 1)))
        custo = CUSTOS_DICA[numero_dica - 1]

        with conectar_banco() as conexao:
            fase = conexao.execute("SELECT * FROM fases WHERE id = ?", (fase_id,)).fetchone()
            jogador_db = conexao.execute("SELECT * FROM jogadores WHERE id = ?", (jogador["id"],)).fetchone()
            if not fase:
                responder_json(self, {"erro": "Fase não encontrada."}, 404)
                return
            if jogador_db["moedas"] < custo:
                responder_json(self, {"erro": "Moedas insuficientes para comprar dica."}, 400)
                return

            conexao.execute("UPDATE jogadores SET moedas = moedas - ? WHERE id = ?", (custo, jogador["id"]))
            registrar_transacao(conexao, jogador["id"], f"compra_dica_{numero_dica}", -custo, fase["id"])
            conexao.commit()

        linhas = json.loads(fase["linhas_codigo"])
        dicas = [
            fase["dica"] or "Observe quais variáveis precisam existir antes de serem usadas.",
            f"A primeira linha correta é: {linhas[0]}",
            f"Depois da primeira linha, procure a linha que depende dela. A ordem começa assim: {linhas[0]} -> {linhas[1] if len(linhas) > 1 else linhas[0]}",
            "Agora está quase direto: organize de cima para baixo seguindo criação de variáveis, condições/blocos e, por último, a exibição do resultado.",
            "Dica final bem óbvia: a ordem correta é:\n" + "\n".join(f"{i+1}. {linha}" for i, linha in enumerate(linhas)),
        ]
        responder_json(self, {"dica": dicas[numero_dica - 1], "custo": custo, "dicas_usadas": numero_dica, "jogador": jogador_publico(self.buscar_jogador_por_id(jogador["id"]))})

    def api_pular_fase(self):
        jogador = self.exigir_jogador()
        if not jogador:
            return

        dados = ler_json(self)
        fase_id = dados.get("fase_id")

        with conectar_banco() as conexao:
            fase = conexao.execute("SELECT * FROM fases WHERE id = ?", (fase_id,)).fetchone()
            jogador_db = conexao.execute("SELECT * FROM jogadores WHERE id = ?", (jogador["id"],)).fetchone()
            if not fase:
                responder_json(self, {"erro": "Fase não encontrada."}, 404)
                return
            if jogador_db["moedas"] < CUSTO_PULAR_FASE:
                responder_json(self, {"erro": "Moedas insuficientes para pular fase."}, 400)
                return

            conexao.execute(
                "UPDATE jogadores SET moedas = moedas - ?, pontos = MAX(0, pontos - 50), fase_atual_id = NULL WHERE id = ?",
                (CUSTO_PULAR_FASE, jogador["id"]),
            )
            registrar_transacao(conexao, jogador["id"], "pular_fase", -CUSTO_PULAR_FASE, fase["id"])
            self.salvar_progresso(conexao, jogador["id"], fase["id"], "pulada", 0)
            conexao.execute(
                """
                INSERT INTO tentativas
                    (jogador_id, fase_id, acertou, tempo_restante, usou_dica, pulou, dificuldade_no_momento, criado_em)
                VALUES (?, ?, 0, 0, 0, 1, ?, ?)
                """,
                (jogador["id"], fase["id"], fase["dificuldade"], agora_iso()),
            )
            ajustar_habilidade(conexao, jogador["id"])
            conexao.commit()

        responder_json(
            self,
            {
                "ok": True,
                "jogador": jogador_publico(self.buscar_jogador_por_id(jogador["id"])),
                "proxima_fase": self.buscar_fase_recomendada(jogador["id"]),
            },
        )

    def api_comprar_vida(self):
        jogador = self.exigir_jogador()
        if not jogador:
            return

        with conectar_banco() as conexao:
            jogador_db = conexao.execute("SELECT * FROM jogadores WHERE id = ?", (jogador["id"],)).fetchone()
            if jogador_db["moedas"] < CUSTO_VIDA:
                responder_json(self, {"erro": "Moedas insuficientes para comprar vida."}, 400)
                return
            conexao.execute(
                "UPDATE jogadores SET moedas = moedas - ?, vidas = vidas + 1 WHERE id = ?",
                (CUSTO_VIDA, jogador["id"]),
            )
            registrar_transacao(conexao, jogador["id"], "compra_vida", -CUSTO_VIDA)
            conexao.commit()

        responder_json(
            self,
            {
                "ok": True,
                "custo": CUSTO_VIDA,
                "jogador": jogador_publico(self.buscar_jogador_por_id(jogador["id"])),
            },
        )

    def api_comprar_tempo(self):
        jogador = self.exigir_jogador()
        if not jogador:
            return

        dados = ler_json(self)
        fase_id = dados.get("fase_id")
        tempo_restante = int(dados.get("tempo_restante") or 0)
        if tempo_restante > LIMITE_COMPRA_TEMPO:
            responder_json(self, {"erro": "Só é possível comprar tempo quando restarem 20 segundos ou menos."}, 400)
            return
        if tempo_restante <= 0:
            responder_json(self, {"erro": "O tempo da fase já terminou."}, 400)
            return

        with conectar_banco() as conexao:
            fase = conexao.execute("SELECT id FROM fases WHERE id = ?", (fase_id,)).fetchone()
            jogador_db = conexao.execute("SELECT * FROM jogadores WHERE id = ?", (jogador["id"],)).fetchone()
            if not fase:
                responder_json(self, {"erro": "Fase não encontrada."}, 404)
                return
            if jogador_db["moedas"] < CUSTO_TEMPO:
                responder_json(self, {"erro": "Moedas insuficientes para comprar tempo."}, 400)
                return
            conexao.execute(
                "UPDATE jogadores SET moedas = moedas - ? WHERE id = ?",
                (CUSTO_TEMPO, jogador["id"]),
            )
            registrar_transacao(conexao, jogador["id"], "compra_tempo", -CUSTO_TEMPO, fase["id"])
            conexao.commit()

        responder_json(
            self,
            {
                "ok": True,
                "custo": CUSTO_TEMPO,
                "tempo_adicionado": BONUS_TEMPO,
                "jogador": jogador_publico(self.buscar_jogador_por_id(jogador["id"])),
            },
        )



    def buscar_jogador_por_id(self, jogador_id):
        with conectar_banco() as conexao:
            return conexao.execute("SELECT * FROM jogadores WHERE id = ?", (jogador_id,)).fetchone()

    def buscar_ranking(self):
        with conectar_banco() as conexao:
            ranking = conexao.execute(
                """
                SELECT id, nome, pontos, nivel_habilidade
                FROM jogadores
                ORDER BY pontos DESC, nivel_habilidade DESC, nome ASC
                LIMIT 10
                """
            ).fetchall()
        return [dict(linha) for linha in ranking]

    def buscar_fase_recomendada(self, jogador_id):
        with conectar_banco() as conexao:
            jogador = conexao.execute("SELECT * FROM jogadores WHERE id = ?", (jogador_id,)).fetchone()
            fase = buscar_proxima_fase(conexao, jogador)
            conexao.commit()
            return self.fase_resumo(fase)

    def salvar_progresso(self, conexao, jogador_id, fase_id, status, pontos):
        atual = conexao.execute(
            """
            SELECT id, tentativas, melhor_pontuacao
            FROM progresso_jogador
            WHERE jogador_id = ? AND fase_id = ?
            """,
            (jogador_id, fase_id),
        ).fetchone()

        concluida_em = agora_iso() if status in ("concluida", "pulada") else None
        if atual:
            conexao.execute(
                """
                UPDATE progresso_jogador
                SET status = ?,
                    tentativas = tentativas + 1,
                    melhor_pontuacao = MAX(melhor_pontuacao, ?),
                    concluida_em = COALESCE(?, concluida_em)
                WHERE id = ?
                """,
                (status, pontos, concluida_em, atual["id"]),
            )
        else:
            conexao.execute(
                """
                INSERT INTO progresso_jogador
                    (jogador_id, fase_id, status, tentativas, melhor_pontuacao, concluida_em)
                VALUES (?, ?, ?, 1, ?, ?)
                """,
                (jogador_id, fase_id, status, pontos, concluida_em),
            )

    def fase_resumo(self, fase):
        if not fase:
            return None
        return {
            "id": fase["id"],
            "modulo_id": fase["modulo_id"],
            "titulo": fase["titulo"],
            "descricao": fase["descricao"],
            "dificuldade": fase["dificuldade"],
            "tempo_limite": fase["tempo_limite"],
            "recompensa_moedas": fase["recompensa_moedas"],
            "fonte": fase["fonte"],
        }

    def fase_completa(self, fase):
        dados = self.fase_resumo(fase)
        dados.update(
            {
                "linhas_codigo": json.loads(fase["linhas_codigo"]),
                "ordem_correta": json.loads(fase["ordem_correta"]),
                "explicacao": fase["explicacao"],
                "dica": fase["dica"],
            }
        )
        return dados

    def api_fases_legado(self):
        with conectar_banco() as conexao:
            fases = conexao.execute(
                "SELECT id, titulo AS title, dificuldade AS difficulty FROM fases WHERE status = 'publicada' ORDER BY dificuldade, ordem"
            ).fetchall()
        responder_json(self, [dict(fase) for fase in fases])

    def api_fase_legado(self, query):
        parametros = parse_qs(query)
        fase_id = parametros.get("id", [None])[0]
        with conectar_banco() as conexao:
            fase = conexao.execute("SELECT * FROM fases WHERE id = ?", (fase_id,)).fetchone()
        if not fase:
            responder_json(self, {"erro": "Fase não encontrada."}, 404)
            return
        responder_json(
            self,
            {
                "id": fase["id"],
                "title": fase["titulo"],
                "description": fase["descricao"],
                "code_lines": json.loads(fase["linhas_codigo"]),
                "correct_order": json.loads(fase["ordem_correta"]),
                "explanation": fase["explicacao"],
                "time_limit": fase["tempo_limite"],
            },
        )


def iniciar_banco():
    with conectar_banco() as conexao:
        conexao.executescript(
            """
            CREATE TABLE IF NOT EXISTS jogadores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                senha_hash TEXT NOT NULL,
                pontos INTEGER NOT NULL DEFAULT 0,
                moedas INTEGER NOT NULL DEFAULT 50,
                vidas INTEGER NOT NULL DEFAULT 5,
                nivel_habilidade INTEGER NOT NULL DEFAULT 1,
                fase_atual_id INTEGER,
                modulo_escolhido_id INTEGER,
                criado_em TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessoes (
                token TEXT PRIMARY KEY,
                jogador_id INTEGER NOT NULL,
                criado_em TEXT NOT NULL,
                expira_em TEXT NOT NULL,
                FOREIGN KEY (jogador_id) REFERENCES jogadores(id)
            );

            CREATE TABLE IF NOT EXISTS modulos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                titulo TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                descricao TEXT,
                linguagem TEXT,
                ordem INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS fases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                modulo_id INTEGER NOT NULL,
                titulo TEXT NOT NULL,
                descricao TEXT NOT NULL,
                linhas_codigo TEXT NOT NULL,
                ordem_correta TEXT NOT NULL,
                explicacao TEXT,
                dica TEXT,
                dificuldade INTEGER NOT NULL DEFAULT 1,
                tempo_limite INTEGER NOT NULL DEFAULT 60,
                recompensa_moedas INTEGER NOT NULL DEFAULT 10,
                fonte TEXT NOT NULL DEFAULT 'autor',
                status TEXT NOT NULL DEFAULT 'publicada',
                criado_por_jogador_id INTEGER,
                ordem INTEGER NOT NULL DEFAULT 0,
                criado_em TEXT NOT NULL,
                FOREIGN KEY (modulo_id) REFERENCES modulos(id),
                FOREIGN KEY (criado_por_jogador_id) REFERENCES jogadores(id)
            );

            CREATE TABLE IF NOT EXISTS progresso_jogador (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                jogador_id INTEGER NOT NULL,
                fase_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'em_andamento',
                tentativas INTEGER NOT NULL DEFAULT 0,
                melhor_pontuacao INTEGER NOT NULL DEFAULT 0,
                concluida_em TEXT,
                UNIQUE (jogador_id, fase_id),
                FOREIGN KEY (jogador_id) REFERENCES jogadores(id),
                FOREIGN KEY (fase_id) REFERENCES fases(id)
            );

            CREATE TABLE IF NOT EXISTS tentativas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                jogador_id INTEGER NOT NULL,
                fase_id INTEGER NOT NULL,
                acertou INTEGER NOT NULL,
                tempo_restante INTEGER NOT NULL DEFAULT 0,
                usou_dica INTEGER NOT NULL DEFAULT 0,
                pulou INTEGER NOT NULL DEFAULT 0,
                dificuldade_no_momento INTEGER NOT NULL DEFAULT 1,
                criado_em TEXT NOT NULL,
                FOREIGN KEY (jogador_id) REFERENCES jogadores(id),
                FOREIGN KEY (fase_id) REFERENCES fases(id)
            );

            CREATE TABLE IF NOT EXISTS transacoes_moedas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                jogador_id INTEGER NOT NULL,
                fase_id INTEGER,
                tipo TEXT NOT NULL,
                valor INTEGER NOT NULL,
                criado_em TEXT NOT NULL,
                FOREIGN KEY (jogador_id) REFERENCES jogadores(id),
                FOREIGN KEY (fase_id) REFERENCES fases(id)
            );
            """
        )
        aplicar_migracoes(conexao)
        sem_modulos = conexao.execute("SELECT COUNT(*) AS total FROM modulos").fetchone()["total"] == 0
        if sem_modulos:
            inserir_dados_iniciais(conexao)
            aplicar_migracoes(conexao)
        atualizar_base_de_fases(conexao)
        conexao.commit()


def coluna_existe(conexao, tabela, coluna):
    return any(linha["name"] == coluna for linha in conexao.execute(f"PRAGMA table_info({tabela})"))


def aplicar_migracoes(conexao):
    if not coluna_existe(conexao, "jogadores", "modulo_escolhido_id"):
        conexao.execute("ALTER TABLE jogadores ADD COLUMN modulo_escolhido_id INTEGER")

    poscomp = conexao.execute("SELECT id FROM modulos WHERE slug = 'poscomp'").fetchone()
    if poscomp:
        fase_ids = [linha["id"] for linha in conexao.execute("SELECT id FROM fases WHERE modulo_id = ?", (poscomp["id"],))]
        if fase_ids:
            marcadores = ",".join("?" for _ in fase_ids)
            conexao.execute(f"DELETE FROM progresso_jogador WHERE fase_id IN ({marcadores})", fase_ids)
            conexao.execute(f"DELETE FROM tentativas WHERE fase_id IN ({marcadores})", fase_ids)
            conexao.execute(f"DELETE FROM transacoes_moedas WHERE fase_id IN ({marcadores})", fase_ids)
            conexao.execute(f"DELETE FROM fases WHERE id IN ({marcadores})", fase_ids)
        conexao.execute("DELETE FROM modulos WHERE id = ?", (poscomp["id"],))


def garantir_modulo(conexao, titulo, slug, descricao, linguagem, ordem):
    modulo = conexao.execute("SELECT id FROM modulos WHERE slug = ?", (slug,)).fetchone()
    if modulo:
        conexao.execute(
            "UPDATE modulos SET titulo = ?, descricao = ?, linguagem = ?, ordem = ? WHERE id = ?",
            (titulo, descricao, linguagem, ordem, modulo["id"]),
        )
        return modulo["id"]

    cursor = conexao.execute(
        "INSERT INTO modulos (titulo, slug, descricao, linguagem, ordem) VALUES (?, ?, ?, ?, ?)",
        (titulo, slug, descricao, linguagem, ordem),
    )
    return cursor.lastrowid


def garantir_fase(conexao, modulo_id, titulo, descricao, linhas, ordem_correta, explicacao, dica, dificuldade, tempo_limite, recompensa, fonte, ordem):
    fase = conexao.execute(
        "SELECT id FROM fases WHERE modulo_id = ? AND titulo = ?",
        (modulo_id, titulo),
    ).fetchone()
    if not fase:
        fase = conexao.execute(
            """
            SELECT id FROM fases
            WHERE modulo_id = ?
              AND ordem = ?
              AND fonte = ?
              AND criado_por_jogador_id IS NULL
            """,
            (modulo_id, ordem, fonte),
        ).fetchone()

    valores = (
        modulo_id,
        titulo,
        descricao,
        json.dumps(linhas, ensure_ascii=False),
        json.dumps(ordem_correta),
        explicacao,
        dica,
        dificuldade,
        tempo_limite,
        recompensa,
        fonte,
        "publicada",
        ordem,
        agora_iso(),
    )

    if fase:
        conexao.execute(
            """
            UPDATE fases
            SET titulo = ?, descricao = ?, linhas_codigo = ?, ordem_correta = ?, explicacao = ?,
                dica = ?, dificuldade = ?, tempo_limite = ?, recompensa_moedas = ?,
                fonte = ?, status = 'publicada', ordem = ?
            WHERE id = ?
            """,
            (
                titulo,
                descricao,
                json.dumps(linhas, ensure_ascii=False),
                json.dumps(ordem_correta),
                explicacao,
                dica,
                dificuldade,
                tempo_limite,
                recompensa,
                fonte,
                ordem,
                fase["id"],
            ),
        )
        return fase["id"]

    conexao.execute(
        """
        INSERT INTO fases
            (modulo_id, titulo, descricao, linhas_codigo, ordem_correta, explicacao,
             dica, dificuldade, tempo_limite, recompensa_moedas, fonte, status, ordem, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        valores,
    )


def atualizar_base_de_fases(conexao):
    linguagens = [
        ("Java", "java"),
        ("Python", "python"),
        ("JavaScript", "javascript"),
        ("C#", "csharp"),
    ]
    assuntos = [
        (1, "Variáveis e Saída", "variaveis", "Conceitos iniciais: declaração de variáveis, cálculos simples e exibição de valores."),
        (2, "Condicionais", "condicionais", "Decisões com if, else e comparações lógicas."),
        (3, "Estruturas de Repetição", "repeticao", "Laços for, while, percursos em listas/arrays e acumuladores."),
        (4, "Funções e Métodos", "funcoes", "Criação e uso de funções/métodos com parâmetros e retorno."),
    ]

    def tipo_int(lang):
        return "int" if lang in ("Java", "C#") else "const" if lang == "JavaScript" else ""

    def tipo_str(lang):
        return "String" if lang == "Java" else "string" if lang == "C#" else "const" if lang == "JavaScript" else ""

    def decl(lang, nome, valor, tipo=None):
        if lang == "Python":
            return f"{nome} = {valor}"
        if lang == "JavaScript":
            return f"const {nome} = {valor};"
        return f"{tipo or 'int'} {nome} = {valor};"

    def assign(lang, nome, valor):
        return f"{nome} = {valor}" if lang == "Python" else f"{nome} = {valor};"

    def print_line(lang, expr):
        if lang == "Python":
            return f"print({expr})"
        if lang == "JavaScript":
            return f"console.log({expr});"
        if lang == "C#":
            return f"Console.WriteLine({expr});"
        return f"System.out.println({expr});"

    def var_linhas(lang, n):
        if n == 1:
            return [decl(lang, "idade", "20"), print_line(lang, "idade")]
        if n == 2:
            return [decl(lang, "nome", '"Ana"', tipo_str(lang)), decl(lang, "mensagem", '"Ola, " + nome', tipo_str(lang)), print_line(lang, "mensagem")]
        if n == 3:
            return [decl(lang, "a", "5"), decl(lang, "b", "10"), decl(lang, "soma", "a + b"), print_line(lang, "soma")]
        if n == 4:
            tipo = "double" if lang in ("Java", "C#") else None
            return [decl(lang, "nota1", "8", tipo), decl(lang, "nota2", "6", tipo), decl(lang, "media", "(nota1 + nota2) / 2", tipo), print_line(lang, "media")]
        if n == 5:
            tipo = "double" if lang in ("Java", "C#") else None
            return [decl(lang, "preco", "100", tipo), decl(lang, "desconto", "15", tipo), decl(lang, "finalCompra", "preco - desconto", tipo), print_line(lang, "finalCompra")]
        if n == 6:
            tipo = "boolean" if lang == "Java" else "bool" if lang == "C#" else None
            val = "true" if lang != "Python" else "True"
            return [decl(lang, "ativo", val, tipo), print_line(lang, "ativo")]
        if n == 7:
            return [decl(lang, "base", "4"), decl(lang, "altura", "3"), decl(lang, "area", "base * altura"), print_line(lang, "area")]
        if n == 8:
            return [decl(lang, "produto", '"Livro"', tipo_str(lang)), decl(lang, "quantidade", "2"), decl(lang, "resumo", 'produto + ": " + quantidade', tipo_str(lang)), print_line(lang, "resumo")]
        if n == 9:
            tipo_bool = "boolean" if lang == "Java" else "bool" if lang == "C#" else None
            return [decl(lang, "temperatura", "38"), decl(lang, "febre", "temperatura >= 37", tipo_bool), print_line(lang, "febre")]
        return [decl(lang, "contador", "1"), assign(lang, "contador", "contador + 1"), print_line(lang, "contador")]

    def cond_linhas(lang, n):
        py = lang == "Python"
        out = []
        if n == 1:
            out = [decl(lang, "idade", "18"), "if idade >= 18:" if py else "if (idade >= 18) {", "    " + print_line(lang, "'Maior de idade'" if py else '"Maior de idade"')]
        elif n == 2:
            out = [decl(lang, "nota", "6"), "if nota >= 7:" if py else "if (nota >= 7) {", "    " + print_line(lang, "'Aprovado'" if py else '"Aprovado"'), "else:" if py else "} else {", "    " + print_line(lang, "'Revisar'" if py else '"Revisar"')]
        elif n == 3:
            out = [decl(lang, "numero", "8"), "if numero % 2 == 0:" if py else "if (numero % 2 == 0) {", "    " + print_line(lang, "'Par'" if py else '"Par"'), "else:" if py else "} else {", "    " + print_line(lang, "'Impar'" if py else '"Impar"')]
        elif n == 4:
            out = [decl(lang, "saldo", "100"), decl(lang, "saque", "60"), "if saldo >= saque:" if py else "if (saldo >= saque) {", "    " + print_line(lang, "'Saque permitido'" if py else '"Saque permitido"')]
        elif n == 5:
            out = [decl(lang, "temperatura", "30"), "if temperatura > 28:" if py else "if (temperatura > 28) {", "    " + print_line(lang, "'Calor'" if py else '"Calor"'), "else:" if py else "} else {", "    " + print_line(lang, "'Agradavel'" if py else '"Agradavel"')]
        elif n == 6:
            senha = decl(lang, "senha", '"1234"', tipo_str(lang))
            comp = 'senha == "1234"' if py else 'senha.equals("1234")' if lang == "Java" else 'senha == "1234"'
            out = [senha, f"if {comp}:" if py else f"if ({comp}) {{", "    " + print_line(lang, "'Acesso liberado'" if py else '"Acesso liberado"')]
        elif n == 7:
            out = [decl(lang, "media", "5"), "if media >= 7:" if py else "if (media >= 7) {", "    " + print_line(lang, "'Aprovado'" if py else '"Aprovado"'), "elif media >= 5:" if py else "} else if (media >= 5) {", "    " + print_line(lang, "'Recuperacao'" if py else '"Recuperacao"'), "else:" if py else "} else {", "    " + print_line(lang, "'Reprovado'" if py else '"Reprovado"')]
        elif n == 8:
            out = [decl(lang, "a", "9"), decl(lang, "b", "4"), "if a > b:" if py else "if (a > b) {", "    " + print_line(lang, "a"), "else:" if py else "} else {", "    " + print_line(lang, "b")]
        elif n == 9:
            out = [decl(lang, "estoque", "3"), "if estoque > 0:" if py else "if (estoque > 0) {", "    " + print_line(lang, "'Disponivel'" if py else '"Disponivel"')]
        else:
            out = [decl(lang, "idade", "20"), decl(lang, "temConvite", "true" if not py else "True", "boolean" if lang == "Java" else "bool" if lang == "C#" else None), "if idade >= 18 and temConvite:" if py else "if (idade >= 18 && temConvite) {", "    " + print_line(lang, "'Pode entrar'" if py else '"Pode entrar"')]
        if not py:
            out.append("}")
        return out

    def loop_linhas(lang, n):
        py = lang == "Python"
        if n == 1:
            return ["for i in range(1, 4):" if py else "for (int i = 1; i <= 3; i++) {" if lang != "JavaScript" else "for (let i = 1; i <= 3; i++) {", "    " + print_line(lang, "i")] + ([] if py else ["}"])
        if n == 2:
            return [decl(lang, "contador", "1"), "while contador <= 3:" if py else "while (contador <= 3) {", "    " + print_line(lang, "contador"), "    contador = contador + 1" if py else "    contador++;"] + ([] if py else ["}"])
        if n == 3:
            lista = "nomes = ['Ana', 'Bia']" if py else "String[] nomes = {\"Ana\", \"Bia\"};" if lang == "Java" else "string[] nomes = { \"Ana\", \"Bia\" };" if lang == "C#" else "const nomes = ['Ana', 'Bia'];"
            loop = "for nome in nomes:" if py else "for (String nome : nomes) {" if lang == "Java" else "foreach (string nome in nomes) {" if lang == "C#" else "for (const nome of nomes) {"
            return [lista, loop, "    " + print_line(lang, "nome")] + ([] if py else ["}"])
        if n == 4:
            return [decl(lang, "soma", "0"), "for i in range(1, 4):" if py else "for (int i = 1; i <= 3; i++) {" if lang != "JavaScript" else "for (let i = 1; i <= 3; i++) {", "    soma = soma + i" if py else "    soma = soma + i;", "}" if not py else print_line(lang, "soma"), print_line(lang, "soma") if not py else ""] if not py else [decl(lang, "soma", "0"), "for i in range(1, 4):", "    soma = soma + i", print_line(lang, "soma")]
        if n == 5:
            return ["for i in range(1, 6):" if py else "for (int i = 1; i <= 5; i++) {" if lang != "JavaScript" else "for (let i = 1; i <= 5; i++) {", "    if i % 2 == 0:" if py else "    if (i % 2 == 0) {", "        " + print_line(lang, "i")] + ([] if py else ["    }", "}"])
        if n == 6:
            return [decl(lang, "numero", "3"), "while numero > 0:" if py else "while (numero > 0) {", "    " + print_line(lang, "numero"), "    numero = numero - 1" if py else "    numero--;"] + ([] if py else ["}"])
        if n == 7:
            return [decl(lang, "total", "0"), "for i in range(1, 5):" if py else "for (int i = 1; i <= 4; i++) {" if lang != "JavaScript" else "for (let i = 1; i <= 4; i++) {", "    total = total + 2" if py else "    total = total + 2;", "}" if not py else print_line(lang, "total"), print_line(lang, "total") if not py else ""] if not py else [decl(lang, "total", "0"), "for i in range(1, 5):", "    total = total + 2", print_line(lang, "total")]
        if n == 8:
            return [decl(lang, "aprovados", "0"), "for nota in [8, 5, 9]:" if py else "int[] notas = {8, 5, 9};" if lang in ("Java", "C#") else "const notas = [8, 5, 9];", "for (int nota : notas) {" if lang == "Java" else "foreach (int nota in notas) {" if lang == "C#" else "for (const nota of notas) {" if lang == "JavaScript" else "    if nota >= 7:", "    if (nota >= 7) {" if not py else "        aprovados = aprovados + 1", "        aprovados = aprovados + 1;" if not py else print_line(lang, "aprovados"), "    }" if not py else "", "}" if not py else "", print_line(lang, "aprovados") if not py else ""] if not py else [decl(lang, "aprovados", "0"), "for nota in [8, 5, 9]:", "    if nota >= 7:", "        aprovados = aprovados + 1", print_line(lang, "aprovados")]
        if n == 9:
            return [decl(lang, "i", "0"), "while i < 2:" if py else "while (i < 2) {", "    " + print_line(lang, "'Logica'" if py else '"Logica"'), "    i = i + 1" if py else "    i++;"] + ([] if py else ["}"])
        return ["for letra in 'ABC':" if py else "for (char letra : \"ABC\".toCharArray()) {" if lang == "Java" else "foreach (char letra in \"ABC\") {" if lang == "C#" else "for (const letra of 'ABC') {", "    " + print_line(lang, "letra")] + ([] if py else ["}"])

    def func_linhas(lang, n):
        py = lang == "Python"
        if n == 1:
            return ["def dobro(n):" if py else "static int dobro(int n) {" if lang == "Java" else "static int Dobro(int n) {" if lang == "C#" else "function dobro(n) {", "    return n * 2" if py else "    return n * 2;", "}" if not py else decl(lang, "resultado", "dobro(5)"), decl(lang, "resultado", "dobro(5)" if lang != "C#" else "Dobro(5)"), print_line(lang, "resultado")] if not py else ["def dobro(n):", "    return n * 2", "resultado = dobro(5)", "print(resultado)"]
        name = "soma" if lang != "C#" else "Soma"
        if n == 2:
            return ["def soma(a, b):" if py else "static int soma(int a, int b) {" if lang == "Java" else "static int Soma(int a, int b) {" if lang == "C#" else "function soma(a, b) {", "    return a + b" if py else "    return a + b;", "}" if not py else decl(lang, "total", "soma(2, 3)"), decl(lang, "total", f"{name}(2, 3)"), print_line(lang, "total")] if not py else ["def soma(a, b):", "    return a + b", "total = soma(2, 3)", "print(total)"]
        if n == 3:
            fname = "ehPar" if lang != "C#" else "EhPar"
            ret = "boolean" if lang == "Java" else "bool" if lang == "C#" else ""
            return ["def eh_par(n):" if py else f"static {ret} {fname}(int n) {{" if lang in ("Java", "C#") else "function ehPar(n) {", "    return n % 2 == 0" if py else "    return n % 2 == 0;", "}" if not py else decl(lang, "par", "eh_par(4)"), decl(lang, "par", f"{fname}(4)" if not py else "eh_par(4)", "boolean" if lang == "Java" else "bool" if lang == "C#" else None), print_line(lang, "par")] if not py else ["def eh_par(n):", "    return n % 2 == 0", "par = eh_par(4)", "print(par)"]
        if n == 4:
            fname = "maior" if lang != "C#" else "Maior"
            return ["def maior(a, b):" if py else f"static int {fname}(int a, int b) {{", "    return a if a > b else b" if py else "    return a > b ? a : b;", "}" if not py else decl(lang, "valor", "maior(9, 4)"), decl(lang, "valor", f"{fname}(9, 4)" if not py else "maior(9, 4)"), print_line(lang, "valor")] if not py else ["def maior(a, b):", "    return a if a > b else b", "valor = maior(9, 4)", "print(valor)"]
        fname = "saudacao" if lang != "C#" else "Saudacao"
        if n == 5:
            return ["def saudacao(nome):" if py else f"static String {fname}(String nome) {{" if lang == "Java" else f"static string {fname}(string nome) {{" if lang == "C#" else "function saudacao(nome) {", "    return 'Ola, ' + nome" if py else "    return \"Ola, \" + nome;", "}" if not py else decl(lang, "texto", "saudacao('Ana')"), decl(lang, "texto", f"{fname}(\"Ana\")" if not py else "saudacao('Ana')", tipo_str(lang)), print_line(lang, "texto")] if not py else ["def saudacao(nome):", "    return 'Ola, ' + nome", "texto = saudacao('Ana')", "print(texto)"]
        # Reaproveita variacoes de retorno para manter 10 fases de funcoes.
        return func_linhas(lang, ((n - 6) % 5) + 1)

    def limpar(linhas):
        return [linha for linha in linhas if linha != ""]

    geradores = {
        "variaveis": var_linhas,
        "condicionais": cond_linhas,
        "repeticao": loop_linhas,
        "funcoes": func_linhas,
    }

    modulos_ids = {}
    slugs_oficiais = []
    for linguagem, lang_slug in linguagens:
        for ordem_assunto, titulo_assunto, assunto_slug, descricao in assuntos:
            slug = f"{lang_slug}-{assunto_slug}"
            titulo = f"{linguagem} {ordem_assunto:02d} - {titulo_assunto}"
            modulos_ids[(linguagem, assunto_slug)] = garantir_modulo(conexao, titulo, slug, descricao, linguagem, ordem_assunto)
            slugs_oficiais.append(slug)

    marcadores_slugs = ",".join("?" for _ in slugs_oficiais)
    obsoletos = [linha["id"] for linha in conexao.execute(f"SELECT id FROM modulos WHERE slug NOT IN ({marcadores_slugs})", slugs_oficiais)]
    for modulo_id in obsoletos:
        fase_ids = [linha["id"] for linha in conexao.execute("SELECT id FROM fases WHERE modulo_id = ?", (modulo_id,))]
        if fase_ids:
            marks = ",".join("?" for _ in fase_ids)
            conexao.execute(f"DELETE FROM progresso_jogador WHERE fase_id IN ({marks})", fase_ids)
            conexao.execute(f"DELETE FROM tentativas WHERE fase_id IN ({marks})", fase_ids)
            conexao.execute(f"DELETE FROM transacoes_moedas WHERE fase_id IN ({marks})", fase_ids)
            conexao.execute(f"DELETE FROM fases WHERE id IN ({marks})", fase_ids)
        conexao.execute("DELETE FROM modulos WHERE id = ?", (modulo_id,))

    fases = []
    for linguagem, _ in linguagens:
        for ordem_assunto, titulo_assunto, assunto_slug, _ in assuntos:
            modulo_id = modulos_ids[(linguagem, assunto_slug)]
            gerador = geradores[assunto_slug]
            for numero in range(1, 11):
                titulo = f"{linguagem} {ordem_assunto}.{numero:02d} - {titulo_assunto}"
                descricao = f"Organize as linhas sobre {titulo_assunto.lower()} em {linguagem}."
                linhas = limpar(gerador(linguagem, numero))
                explicacao = "A ordem correta segue a criação dos dados, a decisão/processamento e a exibição do resultado."
                dica = "Procure primeiro as linhas que criam valores; depois organize o processamento e a saída."
                dificuldade = ordem_assunto
                fases.append((modulo_id, titulo, descricao, linhas, list(range(len(linhas))), explicacao, dica, dificuldade, 60 + dificuldade * 15, 10 + dificuldade * 5, "autor", numero))

    oficiais_por_modulo = {}
    for item in fases:
        oficiais_por_modulo.setdefault(item[0], []).append(item[-1])

    for modulo_id, ordens in oficiais_por_modulo.items():
        marcadores = ",".join("?" for _ in ordens)
        antigas = [linha["id"] for linha in conexao.execute(f"""
            SELECT id FROM fases
            WHERE modulo_id = ? AND fonte = 'autor' AND criado_por_jogador_id IS NULL AND ordem NOT IN ({marcadores})
        """, [modulo_id, *ordens])]
        if antigas:
            marks = ",".join("?" for _ in antigas)
            conexao.execute(f"DELETE FROM progresso_jogador WHERE fase_id IN ({marks})", antigas)
            conexao.execute(f"DELETE FROM tentativas WHERE fase_id IN ({marks})", antigas)
            conexao.execute(f"DELETE FROM transacoes_moedas WHERE fase_id IN ({marks})", antigas)
            conexao.execute(f"DELETE FROM fases WHERE id IN ({marks})", antigas)

    for item in fases:
        garantir_fase(conexao, *item)

def inserir_dados_iniciais(conexao):
    atualizar_base_de_fases(conexao)


if __name__ == "__main__":
    iniciar_banco()
    with socketserver.TCPServer(("", PORTA), JogoHandler) as servidor:
        print(f"Servidor rodando na porta {PORTA}")
        servidor.serve_forever()
