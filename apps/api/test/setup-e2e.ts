import { config } from 'dotenv';

// override: true porque o dotenv padrão não sobrescreve variáveis já
// presentes. Sem isso, um .env carregado antes apontaria os testes para
// o banco de desenvolvimento, e o truncate levaria os dados do seed junto.
config({ path: '.env.test', override: true });
