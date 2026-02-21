пше ## Playwright автотесты для demoqa.com (Droppable & Draggable)

Этот проект содержит e2e‑тесты на **Playwright** для разделов **Droppable** и **Draggable** на сайте `https://demoqa.com`.

Тесты заточены под реальные особенности demoqa: рекламу, нестабильные анимации jQuery UI и неидеальные ограничения по осям/контейнерам.

---

## Требования

- **Node.js** 18+ (рекомендуется LTS)
- npm (ставится вместе с Node.js)

Проверить версии:

```bash
node -v
npm -v
```

---

## Установка

1. Установить зависимости:

```bash
npm install
```

2. Скачать браузеры Playwright (нужно сделать один раз):

```bash
# Вариант 1: напрямую
npx playwright install

# Вариант 2: через npm‑скрипт
npm run install:browsers
```

Без этого все тесты будут падать с ошибкой вида:

> browserType.launch: Executable doesn't exist … Please run `npx playwright install`

---

## Структура проекта

- `tests/demoqa.spec.js` — все тесты Droppable и Draggable
- `playwright.config.js` — конфигурация Playwright:
  - `testDir: './tests'`
  - таймауты (`timeout`, `navigationTimeout`, `actionTimeout`)
  - репортёры: HTML + консольный `list`
  - проекты: сейчас только `chromium`
- `package.json` — npm‑скрипты и dev‑зависимости

В `demoqa.spec.js` есть вспомогательные функции:

- `navigateTo(page, section)` — навигация на нужный раздел **через главную страницу** demoqa:
  - кликает по карточке **Interactions**
  - раскрывает нужный пункт меню (Droppable / Draggable)
  - учитывает, что на странице есть несколько одинаковых пунктов с одинаковым текстом
- `removeAds(page)` — вычищает блоки рекламы, которые могут перекрывать элементы
- `dragAndDrop(page, source, target)` — надёжный drag&drop:
  - сначала пробует `source.dragTo(target, { force: true })`
  - если jQuery UI не принимает синтетическое событие — делает нативные `mouse.move/down/up`
- `getBox(locator)` — безопасное получение `boundingBox()` с понятной ошибкой, если элемент не виден
- `dropAttemptShouldBeProcessed` / `dragAttemptShouldBeProcessed` — проверки, что попытка dnd дошла до jQuery UI (классы, style и т.п.), даже если визуальное состояние в headless может отличаться

---

## Запуск тестов

### Из командной строки

- **Все тесты в headless‑режиме:**

```bash
npm test
# или
npx playwright test
```

- **Видимый браузер (для отладки):**

```bash
npm run test:headed
```

- **UI‑режим Playwright (удобный просмотр шагов/видео/скринов):**

```bash
npm run test:ui
```

- **Просмотр последнего HTML‑репорта:**

```bash
npm run report
```

### WebStorm 

1. Открыть проект в IDE.
2. Убедиться, что настроен **Node.js** и установлен `npm`‑интерпретатор.
3. В `package.json`:
   - рядом со скриптом `test` / `test:headed` / `test:ui` нажать зелёный треугольник → **Run**.
4. Для UI‑режима можно создать отдельную **npm run configuration** с командой `run test:ui`.

---

## Особенности и анти‑флак настройки

Демо‑сайт demoqa и jQuery UI ведут себя нестабильно, особенно в headless‑режиме и под Windows. В тестах учтены несколько важных нюансов:

### 1. Асинхронные анимации и обновление DOM

Во многих местах вместо «однократного» чтения позиции используется:

```js
await expect
  .poll(async () => {
    const box = await el.boundingBox();
    if (!box) return 0;
    // считаем смещение относительно исходной позиции
    return Math.min(
      Math.abs(box.x - start.x),
      Math.abs(box.y - start.y)
    );
  }, { timeout: 4000 /*–6000*/ })
  .toBeGreaterThan(минимальное_смещение);
```

**Зачем:** jQuery UI обновляет координаты и состояние с задержкой, и если сразу после `mouse.up()` читать `boundingBox()`, иногда получается `0` — тест падал с `Expected > N, Received 0`. Опрос через `expect.poll` ждёт, пока позиция реально изменится.

Так сделано в тестах:

- **Cursor Style** (Cursor Center / Top Left / Bottom)
- **Revert Draggable** (revertable/notRevertable)
- **Container Restricted** (чтобы дождаться «прилипания» к границам контейнера)

### 2. Неидеальные ограничения по осям (Axis Restricted)

На демо‑странице:

- элемент `Only X` иногда слегка дрейфует по Y
- элемент `Only Y` — по X

Вместо идеального `dy === 0` / `dx === 0` используются условия «движение в основном по нужной оси»:

- для **X‑only**: `dx > 10 && dx > dy` (либо оба сдвига очень маленькие)
- для **Y‑only**: `dy > 10 && dy > dx` (либо оба сдвига очень маленькие)

Это делает тесты устойчивыми к мелкому дрейфу и разнице DPI/viewport.

### 3. Контейнерные ограничения (Container Restricted)

Для проверки, что элемент **не выходит за границы контейнера**, используется опрос:

- сначала читаем границы контейнера
- после агрессивного `mouse.move` далеко за пределы — ждём, пока `boundingBox()` элемента покажет координаты **внутри** этих границ

Это учитывает, что jQuery UI может сначала увести элемент за пределы, а потом «откатить» внутрь контейнера.

### 4. Прокрутка и начальное положение

Перед сложными действиями делается:

- `scrollIntoViewIfNeeded()` — чтобы элемент точно был в видимой области
- небольшие `waitForTimeout(100–150)` после `mouse.down()` — даёт браузеру и jQuery UI время навесить обработчики drag&drop

---

## Совет по прогону

- Для быстрой локальной проверки можно гонять только один suite, например:

```bash
npx playwright test tests/demoqa.spec.js --grep \"Cursor Style\"
```

- Если менялись drag&drop‑утилиты или тайминги, полезно сделать несколько подряд прогонов:

```bash
for /L %i in (1,1,5) do npx playwright test
```

(на Windows в cmd; в PowerShell команда будет выглядеть чуть иначе).

---

## Где смотреть результаты

- **UI‑режим** (`npm run test:ui`) — самый удобный способ:
  - слева дерево тестов
  - по центру — timeline действий и скриншоты «до/после»
  - вкладки `Console`, `Network`, `Errors` помогают разбирать проблемы
- **HTML‑репорт** (`npm run report`) — сохранённый результат последнего прогона.

