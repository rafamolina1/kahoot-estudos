# Caderno — simulados policiais

Simulados para concursos policiais, com questões geradas pelo Gemini, correção no servidor e histórico persistido no Supabase. O formulário continua disponível imediatamente ao abrir o site. Não há cadastro: cada navegador recebe um cookie privado que identifica seu histórico. Limpar os cookies ou trocar de dispositivo perde o acesso a esse histórico; as linhas continuam no banco até serem removidas pelo administrador.

## Configuração local

Requer Node.js 20 ou superior. Não há dependências de runtime para instalar.

1. Crie um projeto no Supabase e execute [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor. O script cria as tabelas `simulations` e `generation_events`, ativa RLS e revoga o acesso dos papéis públicos.
2. Copie `.env.example` para `.env` e preencha `GEMINI_API_KEY`, `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. Use a **secret key** do Supabase (`sb_secret_...`), mantida apenas no servidor. O endereço está em *Integrations → Data API* e a chave em *Settings → API Keys*.
3. Execute `npm start` e abra `http://localhost:3000`. Para desenvolvimento com reinício automático, use `npm run dev`.

Se o banco já foi criado antes da função **Refazer questões pendentes**, execute [`supabase/migrations/20260929_retry.sql`](supabase/migrations/20260929_retry.sql) uma vez no SQL Editor do Supabase. Ele preserva os simulados existentes, adiciona a ligação entre tentativas e permite revisões com menos de cinco questões. Para um projeto novo, basta executar o `schema.sql` atualizado.

Para adicionar o **Caderno de erros** e a exclusão de simulados em um banco já existente, execute também [`supabase/migrations/20260930_caderno_erros.sql`](supabase/migrations/20260930_caderno_erros.sql). Essa migração permite que a exclusão de um simulado apague suas revisões vinculadas. Não execute o esquema inicial novamente em um banco existente.

Para guardar **anotações por questão** em um banco já existente, execute [`supabase/migrations/20260930_anotacoes.sql`](supabase/migrations/20260930_anotacoes.sql) no SQL Editor. Em um projeto novo, a coluna já faz parte do `schema.sql`.

`GEMINI_MODEL` permite trocar o modelo; o padrão é `gemini-3.1-flash-lite`. `PORT` altera a porta local. Reinicie `npm start` após mudar `.env`.

Para testar o fluxo sem chamadas externas, use `PROVIDER=mock npm start`. Sem credenciais Supabase, o servidor local mantém o histórico **temporariamente em memória**, mesmo com Gemini real; a interface sinaliza esse modo. Na Vercel, as credenciais Supabase são obrigatórias. As questões fictícias do modo `mock` são identificadas na interface. Execute `npm test` para os testes automatizados.

## Implantação na Vercel

O projeto já inclui as funções em `api/` e [`vercel.json`](vercel.json). Importe o repositório na Vercel com o preset **Other**. Os arquivos em `public/` são estáticos e as rotas `/api/*` são funções Node. Configure estas variáveis no projeto Vercel para Production e Preview:

| Variável | Valor |
| --- | --- |
| `GEMINI_API_KEY` | Chave da API Gemini |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` (opcional) |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SECRET_KEY` | Secret key do Supabase |

Depois de configurar as variáveis e aplicar a migração ao banco existente, faça um novo deploy. Não coloque chaves em variáveis com prefixo público nem em `public/`. A função de geração aceita até 300 segundos na configuração de Vercel; simulados de 50 questões podem levar mais tempo. Na faixa Hobby, esse tempo depende de Fluid Compute estar ativo.

## Dados e limites

- `simulations` guarda assunto, dificuldade, quantidade, questões, respostas, anotações e nota. O material colado **não** é salvo; apenas a indicação de que foi utilizado. O histórico lista simulados concluídos e permite rever as explicações.
- A interface prioriza o uso em computador: cada questão mostra alternativas e anotações lado a lado. Durante a tentativa, o texto fica no navegador e é enviado ao servidor ao finalizar; na revisão, alterações podem ser salvas por questão. Anotações de questões pendentes acompanham o **Caderno de erros**. Elas não são enviadas ao Gemini.
- **Refazer questões pendentes** cria uma tentativa com as respostas erradas e não respondidas de um simulado concluído. Não chama o Gemini, mantém o gabarito oculto até a correção e preserva a tentativa original. Revisões aparecem no histórico, mas não entram nos três indicadores gerais.
- O histórico agrupa as revisões no **Caderno de erros** do simulado original. É possível apagar uma tentativa em andamento, uma revisão ou o simulado original, sempre com confirmação. Apagar uma revisão remove também as revisões derivadas; apagar o original remove todo o seu caderno de erros. A exclusão é definitiva e só alcança dados do navegador atual.
- A opção **Variada** distribui as questões de forma equilibrada entre os níveis básico, intermediário e avançado. O nível aparece em cada questão e a distribuição é conferida antes da entrega.
- O gabarito e a chave do Supabase ficam no servidor. O navegador recebe o gabarito somente ao finalizar ou abrir uma revisão concluída.
- A função `reserve_generation` do banco limita a três gerações por minuto por navegador e impede outra geração simultânea pelo mesmo navegador, inclusive entre instâncias da Vercel. Ela é chamada apenas pelo servidor.
- O cookie de estudo é `HttpOnly`, `SameSite=Lax` e `Secure` em HTTPS. O banco recebe apenas o hash do identificador, sem o cookie original. Esta é uma separação por navegador, **não uma conta com sincronização entre dispositivos**. Para uso compartilhado entre dispositivos, será necessário adicionar autenticação futuramente.
- Quando o Gemini retorna `429`, a interface mostra uma mensagem de cota. O bloqueio local de chamadas repetidas tem outra mensagem.
- Questões e explicações são geradas por IA para estudo. Não há verificação independente de legislação atual; confira a lei e o edital vigentes.

Referências: [Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js), [duração das funções](https://vercel.com/docs/functions/configuring-functions/duration), [Supabase Data API](https://supabase.com/docs/guides/api), [chaves Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [preços Gemini](https://ai.google.dev/gemini-api/docs/pricing).
