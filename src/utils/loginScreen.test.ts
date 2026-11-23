import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoginScreen } from '../components/LoginScreen';
import { PasswordRecoveryScreen } from '../components/PasswordRecoveryScreen';

const noopAsync = async () => {};

test('LoginScreen renders MGW Gestão identity, email/password fields, eye toggle, links, and Google option', () => {
  const html = renderToStaticMarkup(
    createElement(LoginScreen, {
      onGoogleLogin: noopAsync,
      onEmailLogin: noopAsync,
      onRegister: noopAsync,
      onPasswordReset: noopAsync,
      supportsEmailAuth: true,
      isSigningIn: false,
      errorMessage: null,
      initialMode: 'login',
      onBackToHome: () => {},
    }),
  );

  assert.ok(html.includes('MGW'));
  assert.ok(html.includes('Gestão'));
  assert.ok(html.includes('Faça login para continuar'));
  assert.ok(html.includes('placeholder="Seu e-mail"'));
  assert.ok(html.includes('placeholder="Sua senha"'));
  assert.ok(html.includes('aria-label="Visualizar senha"'));
  assert.ok(html.includes('Entrar'));
  assert.ok(html.includes('Esqueceu sua senha?'));
  assert.ok(html.includes('Criar conta'));
  assert.ok(html.includes('Continuar com Google'));
  assert.ok(html.includes('Voltar para a página inicial'));
  assert.ok(html.includes('bg-[#F5F6FA]'));
  assert.ok(html.includes('bg-[#F5B900]'));
});

test('LoginScreen renders accessible high-contrast auth errors and loading state', () => {
  const html = renderToStaticMarkup(
    createElement(LoginScreen, {
      onGoogleLogin: noopAsync,
      onEmailLogin: noopAsync,
      supportsEmailAuth: true,
      isSigningIn: true,
      errorMessage: 'E-mail ou senha inválidos.',
      initialMode: 'login',
    }),
  );

  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes('E-mail ou senha inválidos.'));
  assert.ok(html.includes('bg-[#FEF2F2]'));
  assert.ok(html.includes('text-[#B91C1C]'));
  assert.ok(!html.includes('#FCA5A5'));
  assert.ok(html.includes('Conectando...'));
  assert.ok(html.includes('aria-busy="true"'));
});

test('LoginScreen renders password reset and registration modes preserving existing flows', () => {
  const resetHtml = renderToStaticMarkup(
    createElement(LoginScreen, {
      onGoogleLogin: noopAsync,
      onPasswordReset: noopAsync,
      supportsEmailAuth: true,
      isSigningIn: false,
      errorMessage: null,
      initialMode: 'reset',
    }),
  );

  assert.ok(resetHtml.includes('Recuperar senha'));
  assert.ok(resetHtml.includes('E-mail para recuperação'));
  assert.ok(resetHtml.includes('Enviar link de recuperação'));
  assert.ok(resetHtml.includes('Voltar'));

  const registerHtml = renderToStaticMarkup(
    createElement(LoginScreen, {
      onGoogleLogin: noopAsync,
      onRegister: noopAsync,
      supportsEmailAuth: true,
      isSigningIn: false,
      errorMessage: null,
      initialMode: 'register',
    }),
  );

  assert.ok(registerHtml.includes('Crie sua conta'));
  assert.ok(registerHtml.includes('Nome do estabelecimento'));
  assert.ok(registerHtml.includes('Criar conta e estabelecimento'));
  assert.ok(registerHtml.includes('Já tenho uma conta'));
  assert.ok(registerHtml.includes('Visualizar confirmação'));
});

test('PasswordRecoveryScreen renders redesigned card, visibility toggles, and accessible error box', () => {
  const html = renderToStaticMarkup(
    createElement(PasswordRecoveryScreen, {
      onSave: noopAsync,
      errorMessage: 'Sua sessão expirou. Faça login novamente.',
    }),
  );

  assert.ok(html.includes('Criar nova senha'));
  assert.ok(html.includes('MGW Gestão'));
  assert.ok(html.includes('aria-label="Visualizar senha"'));
  assert.ok(html.includes('aria-label="Visualizar confirmação"'));
  assert.ok(html.includes('Atualizar senha'));
  assert.ok(html.includes('Sua sessão expirou. Faça login novamente.'));
  assert.ok(html.includes('bg-[#FEF2F2]'));
  assert.ok(html.includes('text-[#B91C1C]'));
});
