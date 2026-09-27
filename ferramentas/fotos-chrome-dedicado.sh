#!/bin/bash
# fotos-chrome-dedicado — Chrome isolado para a busca de fotos dos produtos (ferramentas/buscar_fotos.py navegador).
# Mesmo desenho dos Chromes dedicados do Suno e do YouTube: perfil próprio (não toca no Chrome pessoal),
# sobe em segundo plano sem roubar a frente e a automação fala com ele pela porta CDP.
#
# Uso: sh ferramentas/fotos-chrome-dedicado.sh [start|stop|status]
#
# Perfil: ~/.cache/estoque-fotos-chrome-profile · CDP: http://127.0.0.1:9231
# Portas: Suno 9223, Ditto 9224, YouTube 9225, comunidade (Hermes) 9226, fotos do estoque 9231.

PROFILE="$HOME/.cache/estoque-fotos-chrome-profile"
PORT=9231
LOG=/tmp/estoque-fotos-chrome.log

rodando() { pgrep -f "estoque-fotos-chrome-profile.*$PORT" >/dev/null; }

esperar_cdp() {
  for _ in $(seq 1 60); do
    curl -s -m 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1 && return 0
    sleep 0.25
  done
  return 1
}

case "${1:-start}" in
  start)
    if rodando; then
      echo "Chrome das fotos já rodando (porta $PORT)"
      exit 0
    fi
    if lsof -tiTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
      echo "A porta $PORT já é de outro programa: não subo (senão a busca falaria com o Chrome errado)"; exit 1
    fi
    mkdir -p "$PROFILE"
    # --no-startup-window + aba criada pelo CDP em segundo plano: não rouba a frente de quem usa o Mac.
    # Sem freio de segundo plano: com a janela encoberta o Chrome estrangularia os timers e a busca travaria.
    FRENTE_PID=$(osascript -e 'tell application "System Events" to return unix id of first process whose frontmost is true' 2>/dev/null)
    open -g -n -a "Google Chrome" --stdout "$LOG" --stderr "$LOG" --args \
      --user-data-dir="$PROFILE" \
      --remote-debugging-port=$PORT \
      --remote-allow-origins="*" \
      --no-first-run \
      --no-default-browser-check \
      --disable-features=Translate,IntensiveWakeUpThrottling \
      --disable-background-timer-throttling \
      --disable-renderer-backgrounding \
      --disable-backgrounding-occluded-windows \
      --mute-audio \
      --autoplay-policy=document-user-activation-required \
      --no-startup-window
    if ! esperar_cdp; then
      echo "CDP não respondeu — veja $LOG"; tail -20 "$LOG"; exit 1
    fi
    # uma aba em janela nova, atrás de tudo
    /usr/bin/curl -s -X PUT "http://127.0.0.1:$PORT/json/new?about:blank" >/dev/null
    DEDICADO_PID=$(pgrep -f "estoque-fotos-chrome-profile.*$PORT" | head -1)
    AGORA_PID=$(osascript -e 'tell application "System Events" to return unix id of first process whose frontmost is true' 2>/dev/null)
    if [ -n "$FRENTE_PID" ] && [ "$AGORA_PID" = "$DEDICADO_PID" ] && [ "$FRENTE_PID" != "$DEDICADO_PID" ]; then
      osascript -e "tell application \"System Events\" to set frontmost of (first process whose unix id is $FRENTE_PID) to true" >/dev/null 2>&1
    fi
    echo "Chrome das fotos iniciado em segundo plano (CDP http://127.0.0.1:$PORT)"
    ;;
  stop)
    # "estoque-fotos-chrome-profile" é o perfil DEDICADO: o Chrome pessoal nunca casa com este nome.
    pkill -f "estoque-fotos-chrome-profile.*$PORT" 2>/dev/null
    sleep 1
    pgrep -f "estoque-fotos-chrome-profile" >/dev/null && pkill -f "estoque-fotos-chrome-profile" 2>/dev/null && sleep 2
    if pgrep -f "estoque-fotos-chrome-profile" >/dev/null; then
      echo "Não consegui encerrar o Chrome das fotos"; exit 1
    fi
    echo "Parado"
    ;;
  status)
    if rodando; then echo "Rodando (porta $PORT)"; else echo "Parado"; fi
    ;;
  *)
    echo "Uso: $0 [start|stop|status]"; exit 1
    ;;
esac
