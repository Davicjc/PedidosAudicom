# Guia de Configuração — Firebase do Zero (Seguro)

Este documento explica como criar e configurar um novo projeto Firebase para o sistema PedidosAudicom com todas as medidas de segurança aplicadas.

---

## 1. Criar o Projeto no Firebase Console

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **"Adicionar projeto"**
3. Dê um nome (ex: `audicom-pedidos`)
4. Desative o Google Analytics (não é necessário)
5. Clique em **"Criar projeto"**

---

## 2. Registrar o App Web

1. Na tela inicial do projeto, clique no ícone **`</>`** (Web)
2. Dê um apelido (ex: `portal-audicom`)
3. **Não** marque "Firebase Hosting" por enquanto
4. Clique em **"Registrar app"**
5. Copie o objeto `firebaseConfig` exibido e cole no arquivo `firebase.js` do projeto:

```javascript
const firebaseConfig = {
  apiKey:            "SUA_API_KEY",
  authDomain:        "SEU_PROJETO.firebaseapp.com",
  projectId:         "SEU_PROJETO",
  storageBucket:     "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId:             "SEU_APP_ID"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
```

---

## 3. Ativar o Firebase Authentication

1. No menu lateral, clique em **"Authentication"**
2. Clique em **"Começar"**
3. Na aba **"Sign-in method"**, clique em **"E-mail/senha"**
4. Ative **"E-mail/senha"** (primeira opção)
5. Deixe **"Link de e-mail"** desativado
6. Clique em **"Salvar"**

> **Por que isso resolve o problema das senhas?**
> O Firebase Authentication armazena senhas com bcrypt + salt. Nenhuma senha fica em texto puro no Firestore ou no código. O sistema não tem mais acesso à senha real — apenas o Firebase Auth.

---

## 4. Criar o Banco de Dados (Firestore)

1. No menu lateral, clique em **"Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. Selecione **"Iniciar no modo de produção"** (não use modo de teste!)
4. Escolha a região mais próxima (ex: `southamerica-east1` para Brasil)
5. Clique em **"Ativar"**

---

## 5. Configurar as Regras de Segurança do Firestore

1. No Firestore, clique na aba **"Regras"**
2. Substitua o conteúdo pelo seguinte:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── PEDIDOS ───────────────────────────────────────────
    match /pedidos/{pedidoId} {
      // Qualquer pessoa pode criar um pedido (clientes não precisam de conta)
      allow create: if true;

      // Apenas admins autenticados podem ler, editar e apagar
      allow get:    if request.auth != null;
      allow update: if request.auth != null;
      allow delete: if request.auth != null &&
        get(/databases/$(database)/documents/usuarios_adm/$(request.auth.uid)).data.master == true;

      // Clientes podem listar (buscar por CPF) com limite de 10 documentos
      // Isso impede enumeração em massa mas permite o cliente ver seu pedido
      allow list: if request.auth != null || request.query.limit <= 10;
    }

    // ── USUÁRIOS ADM ──────────────────────────────────────
    match /usuarios_adm/{userId} {
      // Apenas admins autenticados podem ler a lista de usuários
      allow read: if request.auth != null &&
        (request.auth.uid == userId ||
         get(/databases/$(database)/documents/usuarios_adm/$(request.auth.uid)).data.master == true);

      // Somente master pode criar novos usuários ADM
      allow create: if request.auth != null &&
        get(/databases/$(database)/documents/usuarios_adm/$(request.auth.uid)).data.master == true;

      // Admin pode editar o próprio; master pode editar qualquer um
      allow update: if request.auth != null &&
        (request.auth.uid == userId ||
         get(/databases/$(database)/documents/usuarios_adm/$(request.auth.uid)).data.master == true);

      // Somente master pode excluir
      allow delete: if request.auth != null &&
        get(/databases/$(database)/documents/usuarios_adm/$(request.auth.uid)).data.master == true;

      // Permite verificar se a coleção está vazia (primeiro acesso)
      // Retorna apenas 1 documento, sem dados sensíveis expostos
      allow list: if request.query.limit == 1;
    }
  }
}
```

3. Clique em **"Publicar"**

---

## 6. Configurar Índices (se necessário)

O Firestore pode pedir para criar índices quando a aplicação fizer consultas compostas. Se aparecer um erro no console do navegador com um link para criar um índice, clique no link — ele cria automaticamente.

O principal índice necessário é:
- Coleção: `pedidos`
- Campos: `cpf` (Crescente) + `criadoEm` (Decrescente)

---

## 7. Primeiro Acesso ao Painel ADM

Após configurar tudo:

1. Abra o sistema no navegador
2. Clique em **"Acesso Interno"**
3. O sistema detecta que não há nenhum admin e mostra o formulário de **primeiro acesso**
4. Digite a senha master (mínimo 6 caracteres)
5. A conta `admin` é criada no Firebase Authentication com e-mail interno `admin@audicom.local`
6. O documento do usuário é salvo no Firestore com o UID do Firebase Auth

---

## 8. Gerenciar Admins (pelo painel)

- **Criar novos usuários**: Painel ADM → aba "Usuários" → "Novo Usuário"
  - O nome do usuário vira o login: "João Silva" → login `joao.silva`
  - A senha é definida pelo admin master
  - A conta é criada no Firebase Authentication automaticamente

- **Remover usuário**: Apaga o documento do Firestore (login bloqueado imediatamente)
  - Para remoção completa do Firebase Auth: acesse o Console → Authentication → Usuários → exclua manualmente

- **Resetar senha de outro usuário**: Não é possível pelo painel (limitação da SDK do cliente).
  - Acesse: Firebase Console → Authentication → Usuários → clique nos 3 pontinhos → "Redefinir senha"
  - Ou: delete o usuário no console e crie novamente pelo painel com nova senha

---

## 9. Resumo das Melhorias de Segurança Aplicadas

| Problema anterior | Solução implementada |
|---|---|
| Senhas em texto puro no Firestore | Firebase Authentication com bcrypt |
| Senhas em texto puro no localStorage | Removido — sessão gerenciada pelo Firebase Auth |
| Login buscava TODOS os usuários | Login via Firebase Auth + 1 leitura de doc por UID |
| Sem bloqueio por tentativas | Rate limiting client-side (5 tentativas → 30s) + Firebase Auth server-side |
| Regras Firestore abertas (`if true`) | Regras específicas por coleção e por role |
| Senha de outros usuários alterável | Restrito: só a própria conta via SDK; outros pelo Console |
| Qualquer um podia criar admin | Criação de usuários restrita a master autenticado |

---

## 10. O que Ainda Requer Atenção Futura

- **Firebase Storage**: Atualmente selfies e assinaturas ficam em base64 dentro do documento Firestore (limite de 1MB por doc). Para pedidos com foto + 2 assinaturas, pode chegar perto do limite. A solução ideal é usar Firebase Storage para salvar as imagens e guardar apenas a URL no Firestore. Requer adicionar o SDK de Storage e refatorar o upload.

- **HTTPS obrigatório**: O sistema deve ser servido sempre via HTTPS. Nunca abrir diretamente como `file://` em produção.

- **Backup do Firestore**: Configure exportações periódicas em Console → Firestore → Importar/Exportar.
