/**
 * Bản dịch mô tả slash command (description_localizations) cho Discord.
 *
 * Vì sao cần: mô tả lệnh mặc định là tiếng Việt (sản phẩm gốc) nên trong
 * Discord App Discovery ("khám phá ứng dụng") và chỗ gõ lệnh, người dùng quốc
 * tế toàn đọc tiếng Việt. Discord tự hiển thị theo ngôn ngữ client của người
 * dùng (interaction.locale) nếu lệnh khai báo `description_localizations` —
 * VI là mặc định trong slash.js (không cần khai báo), còn EN/DE khai báo tại
 * đây. Tên lệnh/subcommand đã là tiếng Anh sẵn nên chỉ cần dịch mô tả.
 *
 * Quy tắc giữ khớp với slash.js (test-slash-command-contract.cjs chốt hạ):
 *  - Mọi lệnh đều phải có mục trong LOCALIZATIONS, thiếu là test đỏ.
 *  - Giá trị mô tả ≤100 ký tự (giới hạn Discord API), tên choice ≤100.
 *  - key locale Discord hợp lệ: "en-US" (tiếng Anh Mỹ) và "de" (tiếng Đức).
 */

/** Ghép cặp [en, de] thành object localization Discord. */
const pair = ([en, de]) => ({ "en-US": en, de });

const LOCALIZATIONS = {
  help: {
    d: ["View the bot's command list", "Befehlsliste des Bots anzeigen"],
  },
  ping: {
    d: ["Check the bot's latency", "Latenz des Bots prüfen"],
  },
  health: {
    d: [
      "View AI health: provider, cache, rate limits (mod/admin)",
      "KI-Status ansehen: Provider, Cache, Limits (Mod/Admin)",
    ],
  },
  prefix: {
    d: ["View or change the text command prefix", "Text-Befehlspräfix ansehen oder ändern"],
    opts: {
      set: {
        d: ["New prefix (1-3 special characters)", "Neues Präfix (1-3 Sonderzeichen)"],
      },
    },
  },
  autoreply: {
    d: [
      "Manage keyword / mention auto replies",
      "Auto-Antworten per Schlüsselwort / Erwähnung verwalten",
    ],
    subs: {
      add: {
        d: [
          "Add (or update) an auto reply rule",
          "Auto-Antwort-Regel hinzufügen (oder aktualisieren)",
        ],
        opts: {
          name: { d: ["Rule name (letters, numbers, _ -)", "Regelname (Buchstaben, Zahlen, _ -)"] },
          trigger: {
            d: ["keyword | mention", "Schlüsselwort | Erwähnung"],
            choices: {
              keyword: ["Keyword in message", "Schlüsselwort in Nachricht"],
              mention: ["Tag the bot (@protogon)", "Bot erwähnen (@protogon)"],
            },
          },
          response: {
            d: ["Reply content ({user} to mention)", "Antworttext ({user} zum Erwähnen)"],
          },
          keywords: {
            d: ["Keywords, comma separated", "Schlüsselwörter, durch Komma getrennt"],
          },
          cooldown: {
            d: ["Cooldown seconds (0 = unlimited)", "Cooldown in Sekunden (0 = unbegrenzt)"],
          },
        },
      },
      edit: {
        d: ["Edit a rule's reply / cooldown", "Antwort / Cooldown einer Regel bearbeiten"],
        opts: {
          name: { d: ["Rule to edit", "Zu bearbeitende Regel"] },
          response: {
            d: ["New reply content ({user} to mention)", "Neuer Antworttext ({user} zum Erwähnen)"],
          },
          cooldown: { d: ["New cooldown seconds", "Neuer Cooldown in Sekunden"] },
        },
      },
      list: { d: ["List auto reply rules", "Auto-Antwort-Regeln auflisten"] },
      remove: {
        d: ["Remove an auto reply rule", "Auto-Antwort-Regel entfernen"],
        opts: { name: { d: ["Rule name", "Regelname"] } },
      },
    },
  },
  antinuke: {
    d: ["Manage anti-nuke / anti-raid protection", "Anti-Nuke-/Anti-Raid-Schutz verwalten"],
    subs: {
      status: { d: ["View anti-nuke status", "Anti-Nuke-Status ansehen"] },
      on: { d: ["Enable all anti-nuke modules", "Alle Anti-Nuke-Module aktivieren"] },
      off: { d: ["Disable all anti-nuke modules", "Alle Anti-Nuke-Module deaktivieren"] },
      module: {
        d: ["Toggle a specific module", "Ein bestimmtes Modul ein-/ausschalten"],
        opts: {
          module: { d: ["Module name", "Modulname"] },
          value: { d: ["on | off", "on | off"] },
        },
      },
      unlock: { d: ["Unlock channels immediately", "Kanäle sofort entsperren"] },
      lockdown: {
        d: [
          "Toggle automatic channel lock on raid",
          "Automatische Kanalsperre bei Raid ein-/ausschalten",
        ],
        opts: { value: { d: ["on | off", "on | off"] } },
      },
    },
  },
  badword: {
    d: ["Manage the bad word filter list", "Liste verbotener Wörter verwalten"],
    subs: {
      add: {
        d: ["Add a banned word", "Verbotenes Wort hinzufügen"],
        opts: { word: { d: ["Word to block", "Zu blockierendes Wort"] } },
      },
      remove: {
        d: ["Remove a banned word", "Verbotenes Wort entfernen"],
        opts: { word: { d: ["Word to unblock", "Zu entsperrendes Wort"] } },
      },
      list: { d: ["View the bad word list", "Liste verbotener Wörter ansehen"] },
    },
  },
  heat: {
    d: [
      "View violation heat and server safety level",
      "Verstoß-Heat und Server-Sicherheit ansehen",
    ],
    subs: {
      status: {
        d: ["View heat & safety status", "Heat- & Sicherheitsstatus ansehen"],
      },
    },
  },
  mod: {
    d: [
      "Mod tools: timeout, kick, ban, purge (reasons are logged)",
      "Mod-Werkzeuge: Timeout, Kick, Ban, Purge (mit Protokoll)",
    ],
    subs: {
      timeout: {
        d: ["Temporarily mute (timeout) a member", "Mitglied zeitweise stumm schalten (Timeout)"],
        opts: {
          user: { d: ["Member to timeout", "Mitglied für den Timeout"] },
          duration: {
            d: [
              "Duration: 10m, 2h, 1d, or minutes (max 7 days)",
              "Dauer: 10m, 2h, 1d oder Minuten (max. 7 Tage)",
            ],
          },
          reason: { d: ["Reason", "Grund"] },
        },
      },
      kick: {
        d: ["Kick a member from the server", "Mitglied vom Server kicken"],
        opts: {
          user: { d: ["Member to kick", "Zu kickendes Mitglied"] },
          reason: { d: ["Reason", "Grund"] },
        },
      },
      ban: {
        d: ["Ban a member from the server", "Mitglied vom Server bannen"],
        opts: {
          user: { d: ["Member to ban", "Zu bannendes Mitglied"] },
          reason: { d: ["Reason", "Grund"] },
          delete_days: {
            d: [
              "Delete their messages from the last N days (0-7)",
              "Nachrichten der letzten N Tage löschen (0-7)",
            ],
          },
        },
      },
      purge: {
        d: [
          "Bulk delete messages in the current channel",
          "Nachrichten im aktuellen Kanal massenhaft löschen",
        ],
        opts: {
          count: {
            d: ["Number of messages to delete (1-100)", "Anzahl zu löschender Nachrichten (1-100)"],
          },
        },
      },
      untimeout: {
        d: ["Remove a member's timeout", "Timeout eines Mitglieds aufheben"],
        opts: {
          user: { d: ["Member to un-timeout", "Mitglied, dessen Timeout aufgehoben wird"] },
          reason: { d: ["Reason", "Grund"] },
        },
      },
      unban: {
        d: ["Unban a member", "Mitglied entbannen"],
        opts: {
          user: { d: ["User to unban", "Zu entbannender Benutzer"] },
          reason: { d: ["Reason", "Grund"] },
        },
      },
      unwarn: {
        d: [
          "Clear all accumulated warnings of a member",
          "Alle Verwarnungen eines Mitglieds löschen",
        ],
        opts: {
          user: {
            d: ["Member to clear warnings for", "Mitglied, dessen Verwarnungen gelöscht werden"],
          },
          reason: { d: ["Reason", "Grund"] },
        },
      },
    },
  },
  giveaway: {
    d: ["Run giveaways right in Discord", "Giveaways direkt in Discord veranstalten"],
    subs: {
      start: {
        d: [
          "Start a new giveaway in the current channel",
          "Neues Giveaway im aktuellen Kanal starten",
        ],
        opts: {
          title: { d: ["Giveaway name", "Giveaway-Titel"] },
          prize: { d: ["Prize", "Gewinn"] },
          duration: {
            d: ["Duration: 30m, 2h, 1d (max 7 days)", "Dauer: 30m, 2h, 1d (max. 7 Tage)"],
          },
          winners: {
            d: ["Number of winners (1-20, default 1)", "Anzahl Gewinner (1-20, Standard 1)"],
          },
          prize_role: { d: ["Role granted to winners", "Rolle für die Gewinner"] },
        },
      },
      list: { d: ["List running giveaways", "Laufende Giveaways auflisten"] },
      end: {
        d: [
          "End a giveaway early (bot picks winners)",
          "Giveaway früh beenden (Bot ermittelt Gewinner)",
        ],
        opts: { title: { d: ["Giveaway to end", "Zu beendendes Giveaway"] } },
      },
    },
  },
  reactionrole: {
    d: [
      "Manage reaction role boards (click emoji, get role)",
      "Reaktionsrollen-Panels verwalten (Emoji klicken → Rolle)",
    ],
    subs: {
      list: { d: ["List reaction role boards", "Reaktionsrollen-Panels auflisten"] },
      create: {
        d: ["Create a new reaction role board", "Neues Reaktionsrollen-Panel erstellen"],
        opts: {
          channel: { d: ["Channel to post the board", "Kanal für das Panel"] },
          label: { d: ["Board name", "Panelname"] },
          pairs: {
            d: [
              "Emoji:role pairs, space separated (e.g. ✅:123 ⭐:456)",
              "Emoji:Rolle-Paare, durch Leerzeichen (z. B. ✅:123 ⭐:456)",
            ],
          },
          description: { d: ["Text shown in the embed", "Im Embed angezeigter Text"] },
          thumbnail: { d: ["Thumbnail image URL for the board", "Thumbnail-URL des Panels"] },
        },
      },
      add: {
        d: ["Add an emoji + role pair to a board", "Emoji + Rolle zum Panel hinzufügen"],
        opts: {
          label: { d: ["Board name", "Panelname"] },
          emoji: { d: ["Emoji (unicode / <:name:id> / ID)", "Emoji (Unicode / <:name:id> / ID)"] },
          role: { d: ["Role granted when clicking the emoji", "Rolle beim Klick auf das Emoji"] },
        },
      },
      remove: {
        d: ["Remove an emoji pair from a board", "Emoji-Paar aus dem Panel entfernen"],
        opts: {
          label: { d: ["Board name", "Panelname"] },
          emoji: { d: ["Emoji to remove", "Zu entfernendes Emoji"] },
        },
      },
      edit: {
        d: [
          "Edit board name / description / thumbnail (use - to clear)",
          "Panelname/Beschreibung/Thumbnail bearbeiten (- = löschen)",
        ],
        opts: {
          label: { d: ["Current board name", "Aktueller Panelname"] },
          new_label: { d: ["New board name", "Neuer Panelname"] },
          description: {
            d: ["New description (use (-) to clear)", "Neue Beschreibung ((-) = löschen)"],
          },
          thumbnail: {
            d: ["New thumbnail URL (use (-) to clear)", "Neue Thumbnail-URL ((-) = löschen)"],
          },
        },
      },
      delete: {
        d: ["Delete a reaction role board", "Reaktionsrollen-Panel löschen"],
        opts: { label: { d: ["Board name", "Panelname"] } },
      },
    },
  },
  backup: {
    d: [
      "Back up the server to GitHub & restore after a nuke",
      "Server auf GitHub sichern & nach Nuke wiederherstellen",
    ],
    subs: {
      now: {
        d: [
          "Create a backup now (uploads to GitHub by default)",
          "Jetzt Backup erstellen (standardmäßig zu GitHub)",
        ],
        opts: {
          github: {
            d: [
              "Upload to GitHub (default on) — off to keep Convex only",
              "Zu GitHub hochladen (Standard an) — aus = nur Convex",
            ],
          },
        },
      },
      list: { d: ["List this server's backups", "Backups dieses Servers auflisten"] },
      restore: {
        d: [
          "Restore server structure from a backup",
          "Serverstruktur aus einem Backup wiederherstellen",
        ],
        opts: {
          index: {
            d: ["Position in /backup list (1 = newest)", "Position in /backup list (1 = neuestes)"],
          },
        },
      },
      auto: {
        d: [
          "Toggle scheduled automatic backups (2-30 days, 0 = off)",
          "Automatische Backups ein-/ausschalten (2-30 Tage, 0 = aus)",
        ],
        opts: {
          days: {
            d: ["Days between backups (2-30; 0 = off)", "Tage zwischen Backups (2-30; 0 = aus)"],
          },
        },
      },
    },
  },
  research: {
    d: [
      "Track the bot's threat-intel learning progress",
      "Lernfortschritt der Bedrohungsforschung verfolgen",
    ],
    subs: {
      status: {
        d: [
          "View learning progress: keywords, rounds, sources",
          "Fortschritt: Schlüsselwörter, Runden, Quellen",
        ],
      },
      learn: {
        d: [
          "Trigger a learning round from open sources + AI now",
          "Jetzt eine Lernrunde aus offenen Quellen + KI starten",
        ],
      },
      history: {
        d: ["View the 10 most recent learning rounds", "Die 10 letzten Lernrunden ansehen"],
      },
    },
  },
  report: {
    d: [
      "Report server status — AI scans chat for raids/nuke or false bans",
      "Serverlage melden — KI prüft Chat auf Raid/Nuke/Fehlstrafen",
    ],
    opts: {
      ghichu: {
        d: [
          "Extra note for the AI (e.g. bot just banned @abc by mistake)",
          "Zusatzhinweis für die KI (z. B. Fehlban von @abc)",
        ],
      },
    },
  },
  setup: {
    d: ["Quick bot setup for the server", "Schnelleinrichtung des Bots für den Server"],
    subs: {
      "log-channel": {
        d: ["Choose the anti-nuke alert channel", "Kanal für Anti-Nuke-Warnungen wählen"],
        opts: { channel: { d: ["Log channel", "Log-Kanal"] } },
      },
      "mod-role": {
        d: ["Set the Mod role (anti-nuke exempt)", "Mod-Rolle festlegen (Anti-Nuke-Ausnahme)"],
        opts: { role: { d: ["Mod role", "Mod-Rolle"] } },
      },
      "admin-role": {
        d: ["Set the Admin role (fully exempt)", "Admin-Rolle festlegen (vollständige Ausnahme)"],
        opts: { role: { d: ["Admin role", "Admin-Rolle"] } },
      },
    },
  },
  verify: {
    d: ["Configure member verification", "Mitgliederverifizierung konfigurieren"],
    subs: {
      setup: {
        d: ["Set up the verification channel + roles", "Verifizierungskanal + Rollen einrichten"],
        opts: {
          channel: {
            d: ["Channel showing the verification embed", "Kanal mit dem Verifizierungs-Embed"],
          },
          unverified_role: {
            d: ["Role for new (unverified) members", "Rolle für neue (unverifizierte) Mitglieder"],
          },
          verified_role: {
            d: ["Role granted after verification", "Rolle nach erfolgreicher Verifizierung"],
          },
          method: {
            d: ["Verification method", "Verifizierungsmethode"],
            choices: {
              button: ["Button — click to verify", "Button — zum Verifizieren klicken"],
              captcha: ["Captcha — enter code from DM", "Captcha — Code aus DM eingeben"],
            },
          },
        },
      },
      toggle: {
        d: ["Toggle member verification", "Mitgliederverifizierung ein-/ausschalten"],
        opts: {
          value: {
            d: ["on or off", "on oder off"],
            choices: { on: ["On", "An"], off: ["Off", "Aus"] },
          },
        },
      },
      method: {
        d: ["Change the verification method", "Verifizierungsmethode ändern"],
        opts: {
          type: {
            d: ["Method", "Methode"],
            choices: {
              button: ["Button — click to verify", "Button — zum Verifizieren klicken"],
              captcha: ["Captcha — code via DM", "Captcha — Code per DM"],
            },
          },
        },
      },
    },
  },
  alt: {
    d: ["Configure alt account / VPN detection", "Alt-Account-/VPN-Erkennung konfigurieren"],
    subs: {
      status: { d: ["View alt detection status", "Status der Alt-Erkennung ansehen"] },
      on: { d: ["Enable alt detection", "Alt-Erkennung aktivieren"] },
      off: { d: ["Disable alt detection", "Alt-Erkennung deaktivieren"] },
      punish: {
        d: ["Change the punishment for alt accounts", "Strafe für Alt-Accounts ändern"],
        opts: {
          type: {
            d: ["Punishment", "Strafe"],
            choices: {
              kick: ["Kick", "Kick"],
              ban: ["Ban", "Ban"],
              timeout: ["Timeout", "Timeout"],
              verify: [
                "Verify (re-assign unverified role)",
                "Verifizieren (unverifizierte Rolle zuweisen)",
              ],
            },
          },
        },
      },
      threshold: {
        d: ["Change the risk threshold (10-100)", "Risikoschwellwert ändern (10-100)"],
        opts: { value: { d: ["Risk threshold", "Risikoschwellwert"] } },
      },
      vpn: {
        d: ["Change VPN check mode", "VPN-Prüfmodus ändern"],
        opts: {
          mode: {
            d: ["VPN mode", "VPN-Modus"],
            choices: {
              strict: ["Strict (block)", "Streng (blockieren)"],
              warn: ["Warn (log only)", "Warnen (nur Protokoll)"],
              off: ["Off", "Aus"],
            },
          },
        },
      },
    },
  },
};

/**
 * Áp localizations vào command defs (bất biến — trả object mới, không sửa
 * nguyên bản vì test khác cũng require slash.js). Lệnh/subcommand/option nhận
 * `description_localizations`; choice nhận `name_localizations`. Mục chưa có
 * bản dịch giữ nguyên (Discord rơi về mô tả mặc định tiếng Việt).
 */
function applyOption(option, def) {
  const out = { ...option };
  const match = (def && def.subs && def.subs[out.name]) || (def && def.opts && def.opts[out.name]);
  if (match && match.d) out.description_localizations = pair(match.d);
  if (Array.isArray(out.options) && out.options.length > 0) {
    out.options = out.options.map((so) => applyOption(so, match || def));
  }
  if (Array.isArray(out.choices) && out.choices.length > 0 && match && match.choices) {
    out.choices = out.choices.map((c) =>
      match.choices[c.value] ? { ...c, name_localizations: pair(match.choices[c.value]) } : c,
    );
  }
  return out;
}

function applyLocalizations(commands) {
  return commands.map((cmd) => {
    const def = LOCALIZATIONS[cmd.name];
    if (!def) return cmd;
    const out = { ...cmd };
    if (def.d) out.description_localizations = pair(def.d);
    if (Array.isArray(out.options) && out.options.length > 0) {
      out.options = out.options.map((o) => applyOption(o, def));
    }
    return out;
  });
}

module.exports = { applyLocalizations, LOCALIZATIONS };
