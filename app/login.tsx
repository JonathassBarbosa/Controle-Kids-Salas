"use client";
import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, LogIn, Mail } from "lucide-react";
import * as api from "./api";
import { ApiError, type LoginResponse } from "./api";

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

export default function Login({ onLoggedIn, initialNotice }: { onLoggedIn: (res: LoginResponse) => void; initialNotice?: string }) {
  const [screen, setScreen] = useState<"login" | "recover" | "reset">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice || "");

  async function submitLogin() {
    if (!username.trim() || !password) {
      setError("Informe usuário e senha.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.login(username.trim(), password);
      onLoggedIn(res);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível entrar. Tente novamente."));
    } finally {
      setBusy(false);
    }
  }

  async function submitRecover() {
    if (!username.trim()) {
      setError("Informe seu usuário ou e-mail.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.recover(username.trim());
      setNotice(res.message);
      setScreen("reset");
    } catch (err) {
      setError(errorMessage(err, "Não foi possível enviar o código agora. Tente novamente."));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset() {
    if (!code.trim()) {
      setError("Informe o código recebido por e-mail.");
      return;
    }
    if (newPassword.length < 12) {
      setError("A nova senha precisa ter pelo menos 12 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.resetPassword(username.trim(), code.trim(), newPassword);
      setNotice("Senha atualizada. Entre com sua nova senha.");
      setScreen("login");
      setPassword("");
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(errorMessage(err, "Não foi possível redefinir a senha agora."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="./gav-logo-blue.png" alt="GAV Hotéis e Resorts" />
          <span>Kids</span>
        </div>

        {screen === "login" && (
          <>
            <p className="eyebrow">ENTRAR</p>
            <h1>Bem-vinda de volta</h1>
            <p className="auth-sub">Use o usuário e a senha cadastrados pelo administrador.</p>
            {notice && <p className="auth-notice">{notice}</p>}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                submitLogin();
              }}
            >
              <label className="field">
                Usuário ou e-mail
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
              </label>
              <label className="field">
                Senha
                <div className="password-field">
                  <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                  <button type="button" aria-label={showPassword ? "Esconder senha" : "Mostrar senha"} onClick={() => setShowPassword((v) => !v)}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <button className="primary auth-submit" type="submit" disabled={busy}>
                {busy ? <Loader2 size={19} className="spin" /> : <LogIn size={19} />}
                Entrar
              </button>
            </form>
            <button
              className="link-button auth-link"
              onClick={() => {
                setScreen("recover");
                setError("");
                setNotice("");
              }}
            >
              Esqueci minha senha
            </button>
          </>
        )}

        {screen === "recover" && (
          <>
            <p className="eyebrow">RECUPERAR SENHA</p>
            <h1>Vamos te ajudar</h1>
            <p className="auth-sub">Informe seu usuário ou e-mail cadastrado. Enviaremos um código de uso único, válido por 15 minutos.</p>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                submitRecover();
              }}
            >
              <label className="field">
                Usuário ou e-mail
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
              </label>
              <button className="primary auth-submit" type="submit" disabled={busy}>
                {busy ? <Loader2 size={19} className="spin" /> : <Mail size={19} />}
                Enviar código por e-mail
              </button>
            </form>
            <button
              className="link-button auth-link"
              onClick={() => {
                setScreen("login");
                setError("");
                setNotice("");
              }}
            >
              Voltar para o login
            </button>
          </>
        )}

        {screen === "reset" && (
          <>
            <p className="eyebrow">NOVA SENHA</p>
            <h1>Cole o código e escolha uma senha</h1>
            {notice && <p className="auth-notice">{notice}</p>}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                submitReset();
              }}
            >
              <label className="field">
                Código recebido por e-mail
                <input value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
              </label>
              <label className="field">
                Nova senha (mínimo 12 caracteres)
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
              </label>
              <label className="field">
                Confirmar nova senha
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              </label>
              <button className="primary auth-submit" type="submit" disabled={busy}>
                {busy ? <Loader2 size={19} className="spin" /> : <KeyRound size={19} />}
                Redefinir senha
              </button>
            </form>
            <button
              className="link-button auth-link"
              onClick={() => {
                setScreen("recover");
                setError("");
                setNotice("");
              }}
            >
              Pedir um novo código
            </button>
          </>
        )}
      </div>
    </div>
  );
}
