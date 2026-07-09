// ==UserScript==
// @name         Codex Reset Bank Lens
// @name:zh-CN   Codex 重置额度透镜
// @namespace    https://github.com/Super-YYQ/codex-reset-bank-lens
// @version      0.1.0
// @description  Inspect Codex banked reset credits as a movable read-only lens on chatgpt.com. No consume.
// @description:zh-CN 在 chatgpt.com 以可移动透镜查看 Codex reset credits。只读查询，不执行重置。
// @author       Super-YYQ
// @match        https://chatgpt.com/*
// @icon         https://chatgpt.com/favicon.ico
// @grant        GM_addStyle
// @run-at       document-idle
// @license      MIT
// @homepageURL  https://github.com/Super-YYQ/codex-reset-bank-lens
// @supportURL   https://github.com/Super-YYQ/codex-reset-bank-lens/issues
// @downloadURL  https://raw.githubusercontent.com/Super-YYQ/codex-reset-bank-lens/main/codex-reset-bank-lens.user.js
// @updateURL    https://raw.githubusercontent.com/Super-YYQ/codex-reset-bank-lens/main/codex-reset-bank-lens.user.js
// ==/UserScript==

(function () {
  'use strict';

  const PROJECT_URL = 'https://github.com/Super-YYQ/codex-reset-bank-lens';
  const SESSION_PATH = '/api/auth/session';
  const CREDITS_PATH = '/backend-api/wham/rate-limit-reset-credits';
  const LOG_PREFIX = '[Codex Reset Bank Lens]';

  const i18n = {
    zh: {
      buttonLabel: 'Lens',
      title: 'Codex Reset Bank Lens',
      subtitle: '用可移动透镜查看重置额度、过期时间和剩余时间',
      availableCredits: '可用 Reset Credits',
      nearestExpiry: '最近到期',
      nearestExpiryTime: '最近到期时间',
      nextReset: '下次额度重置',
      readOnly: '只读查询',
      safeNote: '不包含 consume 接口，不会执行重置。',
      loading: '正在查询...',
      refresh: '刷新',
      close: '关闭',
      github: 'GitHub 项目',
      dragHint: '拖动圆球可移动位置',
      status: '状态',
      grantedAt: '发放时间',
      expiresAt: '过期时间',
      remaining: '剩余',
      redeemed: '已使用',
      redeemedAt: '使用时间',
      yes: '是',
      no: '否',
      unknown: '未知',
      empty: '没有找到 reset credit 明细。可能是当前账号没有可用重置次数，或者接口返回结构已变化。',
      missingToken: '没有拿到 accessToken，请确认你已经登录 chatgpt.com。',
      unauthorized: '请求失败：401 Unauthorized。请刷新 chatgpt.com 并确认登录状态。',
      nonJson: '返回不是 JSON。',
      requestFailed: '请求失败',
      expired: '已过期',
      used: '已使用',
      available: '可用',
      noData: '无数据',
      days: '天',
      hours: '小时',
      minutes: '分钟'
    },
    en: {
      buttonLabel: 'Lens',
      title: 'Codex Reset Bank Lens',
      subtitle: 'A movable lens for reset credits, expiration and remaining time',
      availableCredits: 'Available Reset Credits',
      nearestExpiry: 'Next Expiring',
      nearestExpiryTime: 'Next Expiry Time',
      nextReset: 'Next Limit Reset',
      readOnly: 'Read-only',
      safeNote: 'No consume endpoint is included. This script will not reset anything.',
      loading: 'Loading...',
      refresh: 'Refresh',
      close: 'Close',
      github: 'GitHub project',
      dragHint: 'Drag the orb to move it',
      status: 'Status',
      grantedAt: 'Granted At',
      expiresAt: 'Expires At',
      remaining: 'Remaining',
      redeemed: 'Used',
      redeemedAt: 'Used At',
      yes: 'Yes',
      no: 'No',
      unknown: 'Unknown',
      empty: 'No reset credit details were found. This account may not have available reset credits, or the response shape may have changed.',
      missingToken: 'Could not get accessToken. Please make sure you are logged in to chatgpt.com.',
      unauthorized: 'Request failed: 401 Unauthorized. Please refresh chatgpt.com and confirm your login status.',
      nonJson: 'Response is not JSON.',
      requestFailed: 'Request failed',
      expired: 'Expired',
      used: 'Used',
      available: 'Available',
      noData: 'No data',
      days: 'd',
      hours: 'h',
      minutes: 'm'
    }
  };

  const locale = navigator.language && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const text = i18n[locale];
  const dateFormatter = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  let buttonEl = null;
  let panelEl = null;
  let contentEl = null;
  let isOpen = false;
  let hasLoaded = false;
  let currentState = { kind: 'idle' };
  let dragState = null;
  let suppressNextClick = false;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getOwnValue(object, keys) {
    if (!object || typeof object !== 'object') return undefined;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        return object[key];
      }
    }
    return undefined;
  }

  function parseDateValue(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

    if (typeof value === 'number') {
      const milliseconds = value < 1000000000000 ? value * 1000 : value;
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^\d+$/.test(trimmed)) {
        return parseDateValue(Number(trimmed));
      }
      const date = new Date(trimmed);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  function formatDate(value) {
    const date = parseDateValue(value);
    return date ? dateFormatter.format(date) : '-';
  }

  function formatRemaining(expiresAt, redeemedAt) {
    if (redeemedAt) return text.used;

    const expiry = parseDateValue(expiresAt);
    if (!expiry) return '-';

    const diffMs = expiry.getTime() - Date.now();
    if (diffMs <= 0) return text.expired;

    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (locale === 'zh') {
      return `${days}${text.days} ${hours}${text.hours} ${minutes}${text.minutes}`;
    }

    return `${days}${text.days} ${hours}${text.hours} ${minutes}${text.minutes}`;
  }

  function isRedeemed(status, redeemedAt) {
    if (redeemedAt) return true;
    return /redeemed|used|spent/i.test(String(status || ''));
  }

  function isExpired(expiresAt) {
    const expiry = parseDateValue(expiresAt);
    return Boolean(expiry && expiry.getTime() <= Date.now());
  }

  function findCreditObjects(value) {
    const results = [];
    const seen = new WeakSet();
    const creditKeys = [
      'expires_at',
      'expiresAt',
      'granted_at',
      'grantedAt',
      'status',
      'redeemed_at',
      'redeemedAt'
    ];

    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (seen.has(node)) return;
      seen.add(node);

      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }

      const looksLikeCredit = creditKeys.some((key) => Object.prototype.hasOwnProperty.call(node, key));
      if (looksLikeCredit) {
        results.push(node);
      }

      Object.keys(node).forEach((key) => visit(node[key]));
    }

    visit(value);
    return results;
  }

  function normalizeCredit(raw, index) {
    const grantedAt = getOwnValue(raw, ['granted_at', 'grantedAt']);
    const expiresAt = getOwnValue(raw, ['expires_at', 'expiresAt']);
    const redeemedAt = getOwnValue(raw, ['redeemed_at', 'redeemedAt']);
    const rawStatus = getOwnValue(raw, ['status']);
    const used = isRedeemed(rawStatus, redeemedAt);
    const expired = isExpired(expiresAt);
    const status = rawStatus || (used ? text.used : expired ? text.expired : text.available);

    return {
      index: index + 1,
      status,
      grantedAt,
      expiresAt,
      redeemedAt,
      used,
      expired
    };
  }

  function findFirstTimeByKeys(value, keys) {
    const seen = new WeakSet();

    function visit(node) {
      if (!node || typeof node !== 'object') return null;
      if (seen.has(node)) return null;
      seen.add(node);

      if (Array.isArray(node)) {
        for (const item of node) {
          const found = visit(item);
          if (found) return found;
        }
        return null;
      }

      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(node, key) && parseDateValue(node[key])) {
          return node[key];
        }
      }

      for (const key of Object.keys(node)) {
        const found = visit(node[key]);
        if (found) return found;
      }

      return null;
    }

    return visit(value);
  }

  function summarizeCredits(credits, rawJson) {
    const availableCredits = credits.filter((credit) => !credit.used && !credit.expired);
    const expiringCredits = availableCredits
      .filter((credit) => parseDateValue(credit.expiresAt))
      .sort((left, right) => parseDateValue(left.expiresAt).getTime() - parseDateValue(right.expiresAt).getTime());
    const nearest = expiringCredits[0] || null;
    const nextReset = findFirstTimeByKeys(rawJson, [
      'next_reset_at',
      'nextResetAt',
      'next_refresh_at',
      'nextRefreshAt',
      'reset_at',
      'resetAt',
      'resets_at',
      'resetsAt',
      'rate_limit_reset_at',
      'rateLimitResetAt',
      'next_credit_at',
      'nextCreditAt'
    ]);

    return {
      availableCount: availableCredits.length,
      nearestRemaining: nearest ? formatRemaining(nearest.expiresAt, nearest.redeemedAt) : text.noData,
      nearestExpiryTime: nearest ? formatDate(nearest.expiresAt) : text.noData,
      nextReset: nextReset ? formatDate(nextReset) : ''
    };
  }

  async function readJsonResponse(response) {
    const body = await response.text();
    try {
      return { json: JSON.parse(body), body };
    } catch (error) {
      return { json: null, body };
    }
  }

  async function loadCredits() {
    setState({ kind: 'loading' });

    try {
      const sessionResponse = await fetch(SESSION_PATH, { credentials: 'include' });
      const sessionPayload = await readJsonResponse(sessionResponse);
      if (!sessionPayload.json) {
        setState({ kind: 'error', message: `${text.nonJson}\n\n${sessionPayload.body}` });
        return;
      }

      const token = sessionPayload.json.accessToken || sessionPayload.json.access_token;
      if (!token) {
        setState({ kind: 'error', message: text.missingToken });
        return;
      }

      const creditsResponse = await fetch(CREDITS_PATH, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (creditsResponse.status === 401) {
        setState({ kind: 'error', message: text.unauthorized });
        return;
      }

      const creditsPayload = await readJsonResponse(creditsResponse);
      if (!creditsPayload.json) {
        setState({ kind: 'error', message: `${text.nonJson}\n\n${creditsPayload.body}` });
        return;
      }

      console.log(`${LOG_PREFIX} raw response`, creditsPayload.json);

      const credits = findCreditObjects(creditsPayload.json).map(normalizeCredit);
      if (credits.length === 0) {
        console.log(`${LOG_PREFIX} no reset credit details found`, creditsPayload.json);
        setState({ kind: 'empty' });
        return;
      }

      setState({
        kind: 'success',
        credits,
        summary: summarizeCredits(credits, creditsPayload.json)
      });
      hasLoaded = true;
    } catch (error) {
      setState({
        kind: 'error',
        message: `${text.requestFailed}: ${error && error.message ? error.message : String(error)}`
      });
    }
  }

  function setState(nextState) {
    currentState = nextState;
    renderContent();
    positionPanelNearButton();
  }

  function renderContent() {
    if (!contentEl) return;

    if (currentState.kind === 'idle') {
      contentEl.innerHTML = '';
      return;
    }

    if (currentState.kind === 'loading') {
      contentEl.innerHTML = `<div class="crc-message">${escapeHtml(text.loading)}</div>`;
      return;
    }

    if (currentState.kind === 'error') {
      contentEl.innerHTML = `<pre class="crc-message crc-error">${escapeHtml(currentState.message)}</pre>`;
      return;
    }

    if (currentState.kind === 'empty') {
      contentEl.innerHTML = `<div class="crc-message">${escapeHtml(text.empty)}</div>`;
      return;
    }

    if (currentState.kind === 'success') {
      const summary = currentState.summary;
      const nextResetHtml = summary.nextReset
        ? `<div class="crc-next-reset"><span>${escapeHtml(text.nextReset)}</span><strong>${escapeHtml(summary.nextReset)}</strong></div>`
        : '';

      contentEl.innerHTML = `
        <section class="crc-stats" aria-label="Reset credits summary">
          ${renderStatCard(text.availableCredits, summary.availableCount)}
          ${renderStatCard(text.nearestExpiry, summary.nearestRemaining)}
          ${renderStatCard(text.nearestExpiryTime, summary.nearestExpiryTime)}
        </section>
        ${nextResetHtml}
        <div class="crc-safety">
          <span>${escapeHtml(text.readOnly)}</span>
          <p>${escapeHtml(text.safeNote)}</p>
        </div>
        ${renderTable(currentState.credits)}
      `;
    }
  }

  function renderStatCard(label, value) {
    return `
      <article class="crc-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </article>
    `;
  }

  function renderTable(credits) {
    const rows = credits.map((credit) => {
      const redeemedLabel = credit.used
        ? `${text.yes}${credit.redeemedAt ? ` / ${formatDate(credit.redeemedAt)}` : ''}`
        : text.no;

      return `
        <tr>
          <td>${escapeHtml(credit.index)}</td>
          <td>${escapeHtml(credit.status || text.unknown)}</td>
          <td>${escapeHtml(formatDate(credit.grantedAt))}</td>
          <td>${escapeHtml(formatDate(credit.expiresAt))}</td>
          <td>${escapeHtml(formatRemaining(credit.expiresAt, credit.redeemedAt))}</td>
          <td>${escapeHtml(redeemedLabel)}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="crc-table-wrap">
        <table class="crc-table">
          <thead>
            <tr>
              <th>#</th>
              <th>${escapeHtml(text.status)}</th>
              <th>${escapeHtml(text.grantedAt)}</th>
              <th>${escapeHtml(text.expiresAt)}</th>
              <th>${escapeHtml(text.remaining)}</th>
              <th>${escapeHtml(text.redeemed)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function createUi() {
    buttonEl = document.createElement('button');
    buttonEl.type = 'button';
    buttonEl.className = 'crc-floating-button';
    buttonEl.textContent = text.buttonLabel;
    buttonEl.setAttribute('aria-label', text.title);
    buttonEl.setAttribute('title', text.dragHint);

    panelEl = document.createElement('section');
    panelEl.className = 'crc-panel';
    panelEl.setAttribute('aria-live', 'polite');
    panelEl.innerHTML = `
      <header class="crc-header">
        <div>
          <h2>${escapeHtml(text.title)}</h2>
          <p>${escapeHtml(text.subtitle)}</p>
        </div>
        <div class="crc-actions">
          <button type="button" class="crc-icon-button" data-crc-action="github" title="${escapeHtml(text.github)}" aria-label="${escapeHtml(text.github)}">
            ${githubIconSvg()}
          </button>
          <button type="button" class="crc-icon-button" data-crc-action="refresh" title="${escapeHtml(text.refresh)}" aria-label="${escapeHtml(text.refresh)}">
            ${refreshIconSvg()}
          </button>
          <button type="button" class="crc-icon-button" data-crc-action="close" title="${escapeHtml(text.close)}" aria-label="${escapeHtml(text.close)}">
            ${closeIconSvg()}
          </button>
        </div>
      </header>
      <main class="crc-content"></main>
    `;
    contentEl = panelEl.querySelector('.crc-content');

    buttonEl.addEventListener('click', togglePanel);
    buttonEl.addEventListener('pointerdown', handleButtonPointerDown);
    buttonEl.addEventListener('pointermove', handleButtonPointerMove);
    buttonEl.addEventListener('pointerup', handleButtonPointerUp);
    buttonEl.addEventListener('pointercancel', handleButtonPointerUp);
    panelEl.addEventListener('click', handlePanelClick);

    document.body.appendChild(panelEl);
    document.body.appendChild(buttonEl);
    initializeFloatingPosition();
    window.addEventListener('resize', handleWindowResize);
  }

  function togglePanel(event) {
    if (suppressNextClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
      return;
    }

    isOpen = !isOpen;
    panelEl.classList.toggle('crc-panel-open', isOpen);
    positionPanelNearButton();

    if (isOpen && !hasLoaded) {
      loadCredits();
    }
  }

  function handlePanelClick(event) {
    const actionButton = event.target.closest('[data-crc-action]');
    if (!actionButton) return;

    const action = actionButton.getAttribute('data-crc-action');
    if (action === 'github') {
      window.open(PROJECT_URL, '_blank', 'noopener,noreferrer');
    }
    if (action === 'refresh') {
      loadCredits();
    }
    if (action === 'close') {
      isOpen = false;
      panelEl.classList.remove('crc-panel-open');
    }
  }

  function initializeFloatingPosition() {
    const size = buttonEl.offsetWidth || 62;
    setFloatingButtonPosition(window.innerWidth - size - 22, window.innerHeight - size - 22);
  }

  function handleWindowResize() {
    const rect = buttonEl.getBoundingClientRect();
    setFloatingButtonPosition(rect.left, rect.top);
    positionPanelNearButton();
  }

  function handleButtonPointerDown(event) {
    if (event.button !== 0) return;

    const rect = buttonEl.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: rect.left,
      originY: rect.top,
      moved: false
    };

    buttonEl.setPointerCapture(event.pointerId);
    buttonEl.classList.add('crc-floating-button-dragging');
    event.preventDefault();
  }

  function handleButtonPointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      dragState.moved = true;
    }

    setFloatingButtonPosition(dragState.originX + deltaX, dragState.originY + deltaY);
  }

  function handleButtonPointerUp(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    if (dragState.moved) {
      suppressNextClick = true;
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }

    buttonEl.classList.remove('crc-floating-button-dragging');
    if (buttonEl.hasPointerCapture(event.pointerId)) {
      buttonEl.releasePointerCapture(event.pointerId);
    }
    dragState = null;
  }

  function setFloatingButtonPosition(left, top) {
    if (!buttonEl) return;

    const margin = 12;
    const width = buttonEl.offsetWidth || 62;
    const height = buttonEl.offsetHeight || 62;
    const safeLeft = clamp(left, margin, window.innerWidth - width - margin);
    const safeTop = clamp(top, margin, window.innerHeight - height - margin);

    buttonEl.style.left = `${safeLeft}px`;
    buttonEl.style.top = `${safeTop}px`;
    buttonEl.style.right = 'auto';
    buttonEl.style.bottom = 'auto';

    if (isOpen) {
      positionPanelNearButton();
    }
  }

  function positionPanelNearButton() {
    if (!isOpen || !buttonEl || !panelEl) return;

    const margin = 16;
    const buttonRect = buttonEl.getBoundingClientRect();
    const panelWidth = Math.min(520, window.innerWidth - margin * 2);
    const panelHeight = Math.min(panelEl.offsetHeight || 360, window.innerHeight - margin * 2);
    let left = buttonRect.right - panelWidth;
    let top = buttonRect.top - panelHeight - 12;

    if (top < margin) {
      top = buttonRect.bottom + 12;
    }

    left = clamp(left, margin, window.innerWidth - panelWidth - margin);
    top = clamp(top, margin, window.innerHeight - panelHeight - margin);

    panelEl.style.left = `${left}px`;
    panelEl.style.top = `${top}px`;
    panelEl.style.right = 'auto';
    panelEl.style.bottom = 'auto';
  }

  function clamp(value, min, max) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
  }

  function githubIconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.38 6.84 9.74.5.1.68-.22.68-.49v-1.9c-2.78.62-3.37-1.22-3.37-1.22-.46-1.2-1.11-1.52-1.11-1.52-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.55-1.14-4.55-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.34 9.34 0 0 1 12 6.97c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9v2.84c0 .27.18.59.69.49A10.15 10.15 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"/></svg>';
  }

  function refreshIconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"/></svg>';
  }

  function closeIconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m18 6-12 12M6 6l12 12"/></svg>';
  }

  function addStyles() {
    GM_addStyle(`
      .crc-floating-button {
        position: fixed;
        right: 22px;
        bottom: 22px;
        z-index: 2147483646;
        width: 62px;
        height: 62px;
        border: 0;
        border-radius: 999px;
        color: #ffffff;
        background: radial-gradient(circle at 30% 22%, #fef3c7 0, #22c55e 22%, #2563eb 64%, #111827 100%);
        box-shadow: 0 18px 38px rgba(15, 23, 42, 0.32), 0 0 0 1px rgba(255, 255, 255, 0.45) inset;
        font: 700 13px/1.1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: grab;
        touch-action: none;
        user-select: none;
        transition: filter 160ms ease, transform 160ms ease;
      }

      .crc-floating-button:hover {
        filter: brightness(1.12);
        transform: translateY(-1px);
      }

      .crc-floating-button-dragging {
        cursor: grabbing;
        transform: scale(1.03);
      }

      .crc-panel {
        position: fixed;
        right: 22px;
        bottom: 96px;
        z-index: 2147483645;
        width: 520px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 128px);
        display: none;
        overflow: hidden;
        color: #172033;
        background: rgba(248, 250, 252, 0.97);
        border: 1px solid rgba(37, 99, 235, 0.16);
        border-radius: 18px;
        box-shadow: 0 26px 70px rgba(15, 23, 42, 0.24), 0 0 0 1px rgba(255, 255, 255, 0.8) inset;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .crc-panel::before {
        content: "";
        position: absolute;
        inset: 0 0 auto 0;
        height: 4px;
        background: linear-gradient(90deg, #2563eb, #14b8a6, #f59e0b);
      }

      .crc-panel-open {
        display: block;
      }

      .crc-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        padding: 18px 18px 16px;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(239, 246, 255, 0.94));
        border-bottom: 1px solid rgba(37, 99, 235, 0.12);
      }

      .crc-header h2 {
        margin: 0;
        color: #0f172a;
        font-size: 17px;
        line-height: 1.25;
        letter-spacing: 0;
      }

      .crc-header p {
        margin: 5px 0 0;
        color: #64748b;
        font-size: 12px;
        line-height: 1.45;
        letter-spacing: 0;
      }

      .crc-actions {
        display: inline-flex;
        flex: 0 0 auto;
        gap: 8px;
      }

      .crc-icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        color: #1e293b;
        background: rgba(255, 255, 255, 0.86);
        border: 1px solid rgba(37, 99, 235, 0.16);
        border-radius: 10px;
        cursor: pointer;
        transition: background 150ms ease, border-color 150ms ease;
      }

      .crc-icon-button:hover {
        background: #eff6ff;
        border-color: rgba(37, 99, 235, 0.32);
      }

      .crc-icon-button svg {
        width: 17px;
        height: 17px;
      }

      .crc-content {
        max-height: calc(100vh - 230px);
        overflow: auto;
        padding: 16px;
      }

      .crc-message {
        margin: 0;
        padding: 14px;
        color: #334155;
        background: #ffffff;
        border: 1px solid rgba(37, 99, 235, 0.12);
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .crc-error {
        color: #991b1b;
        background: #fff1f2;
        border-color: rgba(244, 63, 94, 0.24);
      }

      .crc-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .crc-card {
        min-height: 82px;
        padding: 12px;
        background: #ffffff;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
      }

      .crc-card span {
        display: block;
        color: #64748b;
        font-size: 11px;
        line-height: 1.35;
      }

      .crc-card strong {
        display: block;
        margin-top: 8px;
        color: #0f172a;
        font-size: 18px;
        line-height: 1.25;
        word-break: break-word;
      }

      .crc-next-reset {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 10px;
        padding: 10px 12px;
        color: #075985;
        background: #f0f9ff;
        border: 1px solid rgba(14, 165, 233, 0.22);
        border-radius: 12px;
        font-size: 12px;
      }

      .crc-next-reset strong {
        text-align: right;
      }

      .crc-safety {
        margin-top: 12px;
        padding: 12px;
        background: linear-gradient(135deg, #ecfdf5, #f8fafc);
        border: 1px solid rgba(20, 184, 166, 0.22);
        border-radius: 12px;
      }

      .crc-safety span {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 0 9px;
        color: #065f46;
        background: #d1fae5;
        border: 1px solid rgba(16, 185, 129, 0.28);
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
      }

      .crc-safety p {
        margin: 8px 0 0;
        color: #475569;
        font-size: 12px;
        line-height: 1.45;
      }

      .crc-table-wrap {
        margin-top: 12px;
        overflow-x: auto;
        background: #ffffff;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
      }

      .crc-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .crc-table th,
      .crc-table td {
        padding: 10px 9px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.07);
        color: #334155;
        font-size: 12px;
        line-height: 1.45;
        text-align: left;
        vertical-align: top;
        word-break: break-word;
      }

      .crc-table th {
        color: #0f172a;
        background: #f1f5f9;
        font-weight: 700;
      }

      .crc-table tr:last-child td {
        border-bottom: 0;
      }

      .crc-table th:first-child,
      .crc-table td:first-child {
        width: 34px;
      }

      @media (max-width: 560px) {
        .crc-floating-button {
          right: 16px;
          bottom: 16px;
          width: 56px;
          height: 56px;
        }

        .crc-panel {
          right: 16px;
          bottom: 84px;
        }

        .crc-header {
          padding: 15px;
        }

        .crc-stats {
          grid-template-columns: 1fr;
        }
      }
    `);
  }

  addStyles();
  createUi();

  window.setInterval(() => {
    if (isOpen && currentState.kind === 'success') {
      renderContent();
    }
  }, 30000);
})();

