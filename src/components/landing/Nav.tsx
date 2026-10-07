import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { ChevronDown, LayoutDashboard, LogOut } from "lucide-react";
import BotLogo from "../BotLogo";
import { Button } from "../ui/button";
import {
  clearLegacyDiscordAccess,
  clearSessionToken,
  discordAvatarUrl,
  setRememberLogin,
} from "../../lib/discord";
import { useMeSession } from "./shared";
import LangSwitch from "../LangSwitch";
// Bảng chọn trang dùng CHUNG với SiteNav (header các trang khác) — một nguồn
// duy nhất cho danh sách trang + quyền admin, không nhân bản thành 2 bản lệch.
import { PagesMenu } from "../SiteNav";

import { translate } from "../../lib/i18n";
/** Thanh điều hướng cố định trên landing — đăng nhập thì hiện menu tài khoản. */
export default function Nav() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { token, me } = useMeSession();
  const logout = useMutation(api.sessions.logout);
  const avatar = me?.user
    ? discordAvatarUrl({ id: me.user.discordId, avatar: me.user.avatar })
    : null;
  const [remember, setRemember] = useState(sessionStorage.getItem("wio_remember_login") !== "0");

  async function handleLogout() {
    setMenuOpen(false);
    await logout({ token });
    clearSessionToken();
    clearLegacyDiscordAccess();
    navigate("/");
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary p-0.5 shadow-sm">
            <BotLogo className="h-full w-full" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            Protogon<span className="text-primary">.</span>
            <span className="ml-1.5 hidden align-middle text-xs font-semibold text-muted-foreground sm:inline">
              {translate("cùng trợ lý Haimiya")}{" "}
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {(
            [
              // i18n-ok: nhãn dịch lúc render bằng translate(label)
              ["features", "Tính năng"],
              ["antinuke", "Bảo vệ server"],
              ["haimiya", "Haimiya"],
              ["how", "Cách hoạt động"],
            ] as const
          ).map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
              }}
              className="transition-colors hover:text-foreground"
            >
              {translate(label)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <PagesMenu />
          <LangSwitch />
          {me ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pl-1 pr-2.5 transition-colors hover:bg-accent"
              >
                {avatar ? (
                  <img
                    src={avatar}
                    alt={me.user.username}
                    className="h-8 w-8 rounded-full ring-2 ring-primary/40"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">
                    {(me.user.globalName ?? me.user.username).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[8rem] truncate text-sm font-medium sm:block">
                  {me.user.globalName ?? me.user.username}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-border bg-card p-2 shadow-lg backdrop-blur">
                  <div className="border-b border-border/70 px-2.5 pb-2 pt-1">
                    <p className="truncate text-sm font-bold">
                      {me.user.globalName ?? me.user.username}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{me.user.discordId}</p>
                  </div>
                  <Link
                    to="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <LayoutDashboard className="h-4 w-4 text-primary" />{" "}
                    {translate("Bảng điều khiển")}{" "}
                  </Link>
                  <label className="mt-1 flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-accent">
                    <span className="text-xs text-muted-foreground">
                      {translate("Lưu đăng nhập")}{" "}
                      <b className="text-foreground">{translate("(7 ngày)")}</b>
                    </span>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={remember}
                      onClick={(e) => {
                        e.preventDefault();
                        const next = !remember;
                        setRemember(next);
                        setRememberLogin(next);
                      }}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                        remember ? "bg-primary" : "bg-secondary"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          remember ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </label>
                  <button
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                  >
                    <LogOut className="h-4 w-4" /> {translate("Đăng xuất")}{" "}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">{translate("Đăng nhập")}</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
