# Robô do Rodada — onde passa e público

Monta o arquivo `saida/extras.json` que o app lê para mostrar **onde o jogo passa** e
**público (total, pagante, não pagante) e renda**.

| Dado | Fonte | Como |
|---|---|---|
| Canais de transmissão | [Lance! — Onde assistir](https://www.lance.com.br/onde-assistir) | página diária "Jogos de hoje: quem joga e onde assistir" (ontem, hoje e próximos 2 dias) |
| Público e renda | [ge](https://ge.globo.com) | ficha técnica da página de cada jogo das Séries A–D e Copa do Brasil |

Regras de boa convivência embutidas no robô:
* confere o `robots.txt` de cada site antes de cada acesso e **pula o que for proibido**;
* identifica-se como `RodadaBot`, espaça as requisições (1,5 s) e roda só de hora em hora;
* não usa os borderôs em PDF da CBF: `conteudo.cbf.com.br` proíbe robôs.

Se um site mudar o layout, o robô continua rodando e só deixa de preencher aquele dado. Os testes
(`node --test robo/test/`) mostram onde ajustar.
Para uso comercial do app, confira os termos de uso das fontes ou licencie os dados.

## Rodar no seu PC

```powershell
node robo\robo.mjs
```

## Rodar sozinho, de hora em hora (grátis, no GitHub)

1. Crie uma conta em github.com (se ainda não tiver).
2. Crie um repositório **público** (ex.: `rodada-dados`). Um repositório público é necessário para
   o app conseguir baixar o arquivo sem senha. Ele só terá o robô e o JSON, sem dados seus.
3. No repositório, use **Add file → Upload files** e envie as pastas `robo/` e `.github/`
   (mantendo a estrutura `.github/workflows/robo.yml`).
4. Aba **Actions** → habilite os workflows → abra "Robô Rodada" → **Run workflow** para a 1ª execução.
5. Copie o endereço do arquivo e cole no app em **Ajustes → URL de "onde passa e público"**:

```
https://raw.githubusercontent.com/SEU-USUARIO/rodada-dados/main/robo/saida/extras.json
```

A partir daí o GitHub roda o robô a cada hora e o app pega os dados novos sozinho (cache de 10 min).

## Formato do arquivo

```json
{ "generatedAt": "2026-11-24T21:10:00Z",
  "matches": [
    { "date": "2026-11-23", "time": "21:00", "home": "Santos", "away": "Grêmio",
      "competition": "Brasileirão",
      "tv": [ { "name": "Sportv", "type": "fechada" }, { "name": "Premiere", "type": "ppv" } ],
      "attendance": { "paying": null, "present": 43527, "income": 4174815 } } ] }
```
`type`: `aberta`, `fechada`, `ppv`, `streaming`, `youtube` ou `radio`. O app casa cada jogo pela data
e pelos nomes dos clubes (aceita variações como "Athletico PR" / "Atletico Paranaense").
