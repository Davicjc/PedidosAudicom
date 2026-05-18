# Pedidos Audicom

Sistema web para solicitação e acompanhamento de pedidos de internet da **Audicom Telecom**. Clientes fazem pedidos pelo próprio celular ou computador, e a equipe interna gerencia tudo por um painel administrativo em tempo real.

---

## Como funciona

### Para o cliente

1. **Acessa o sistema** e informa seu CPF ou CNPJ
2. **Preenche o pedido** com seus dados, endereço de instalação e escolha do plano
3. **Assina digitalmente** (com o dedo no celular ou mouse no computador)
4. **Acompanha o status** do pedido a qualquer momento pelo mesmo CPF/CNPJ
5. **Conversa com o atendente** pelo chat integrado, direto na tela de status

### Para o atendente (painel ADM)

- Visualiza todos os pedidos em tempo real, com contadores por status
- Filtra por situação (Pendente, Aceito, Recusado, Reaberto, Fechado) ou faz busca por nome, CPF, plano etc.
- Abre o detalhe de qualquer pedido para ver todos os dados e o histórico de mensagens
- Aceita ou recusa o pedido com uma mensagem ao cliente
- Edita os dados do pedido se necessário
- Encerra definitivamente um pedido quando o atendimento estiver concluído

---

## Telas do sistema

### Portal do cliente

| Tela | Descrição |
|---|---|
| Início | Entrada por CPF/CNPJ com validação |
| Novo pedido | Formulário completo com dados pessoais, endereço, plano e assinaturas |
| Status | Situação do pedido com histórico de mensagens e campo para comentar |
| Sucesso | Confirmação após envio do pedido |

### Painel ADM

| Tela | Descrição |
|---|---|
| Login | Acesso por nome e senha |
| Painel principal | Lista de pedidos com filtros, busca e contadores |
| Detalhe do pedido | Dados completos + chat com o cliente + ações |
| Gestão de usuários | Criar, editar e remover acessos ao painel (somente Super Admin) |

---

## Status dos pedidos

```
Pendente → Aceito ou Recusado
Aceito / Recusado → Reaberto  (quando o cliente envia uma mensagem)
Qualquer status → Fechado     (encerramento definitivo pelo atendente)
```

---

## Recursos

- Busca automática de endereço pelo CEP
- Captura de localização GPS do ponto de instalação
- Assinatura digital do cliente e do vendedor
- Suporte a CPF e CNPJ com validação dos dígitos verificadores
- Máscaras automáticas para telefone, CEP e valores em reais
- Interface responsiva — funciona bem em celular, tablet e desktop
- Atualizações em tempo real no painel ADM sem precisar recarregar a página
