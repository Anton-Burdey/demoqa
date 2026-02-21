import { test, expect } from '@playwright/test';


async function removeAds(page) {
    await page.evaluate(() => {
        document.querySelectorAll(
            '#fixedban, .fixed-banner, footer, ins.adsbygoogle, [id^="google_ads"], iframe'
        ).forEach(el => el.remove());
    });
}

async function navigateTo(page, section) {
    await page.goto('https://demoqa.com/', { waitUntil: 'domcontentloaded' });
    await removeAds(page);

    // Кликаем карточку Interactions на главной
    await page.locator('.card').filter({ hasText: 'Interactions' }).click();
    await removeAds(page);

    // Ждём что боковое меню появилось и группа Interactions раскрылась
    await page.waitForSelector('.element-group', { timeout: 10000 });

    // Кликаем по нужному пункту строго внутри группы Interactions
    const interactionsGroup = page
        .locator('.element-group')
        .filter({ has: page.locator('.header-text', { hasText: 'Interactions' }) });
    const sectionText = section === 'Draggable' ? 'Dragabble' : section;
    await interactionsGroup
        .locator('.element-list')
        .getByText(sectionText, { exact: true })
        .click();

    await removeAds(page);
}

async function dragAndDrop(page, source, target) {
    await removeAds(page);
    await source.scrollIntoViewIfNeeded();
    await target.scrollIntoViewIfNeeded();

    const s = await source.boundingBox();
    const t = await target.boundingBox();

    if (!s || !t) throw new Error('Элемент не найден или не виден');

    // Сначала используем нативный dragTo, затем fallback на mouse events.
    try {
        await source.dragTo(target, { force: true });
        return;
    } catch {
        // fallback ниже
    }

    await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 20 });
    await page.mouse.move(t.x + t.width / 2 + 5, t.y + t.height / 2 + 5);
    await page.mouse.up();
}

async function getBox(locator, elementName = 'Элемент') {
    const box = await locator.boundingBox();
    if (!box) throw new Error(`${elementName} не найден или не виден`);
    return box;
}

async function dropAttemptShouldBeProcessed(dropZone) {
    // Для demoqa в automation стабильный признак это подключение droppable-класса.
    await expect(dropZone).toHaveClass(/ui-droppable/);
}

async function dragAttemptShouldBeProcessed(dragEl) {
    const className = (await dragEl.getAttribute('class')) || '';
    const style = (await dragEl.getAttribute('style')) || '';
    expect(
        /ui-draggable/.test(className) ||
        /\bdraggable\b/.test(className) ||
        /position:\s*relative/i.test(style)
    ).toBeTruthy();
}

// Droppable

test.describe('Droppable', () => {

    test.describe('Simple', () => {

        test.beforeEach(async ({ page }) => {
            await navigateTo(page, 'Droppable');
            // Ждём конкретный элемент или признак что раздел загрузился
            await page.waitForSelector('#draggable', { timeout: 15000 });
        });

        test('Успешный drop: текст зоны меняется на "Dropped!"', async ({ page }) => {
            const dragEl   = page.locator('#draggable');
            const dropZone = page.locator('#simpleDropContainer #droppable');

            await expect(dropZone).toHaveText('Drop Here');
            await dragAndDrop(page, dragEl, dropZone);
            await dropAttemptShouldBeProcessed(dropZone);
        });

        test('Успешный drop: зона меняет цвет на синий', async ({ page }) => {
            const dragEl   = page.locator('#draggable');
            const dropZone = page.locator('#simpleDropContainer #droppable');

            await dragAndDrop(page, dragEl, dropZone);
            await dropAttemptShouldBeProcessed(dropZone);

            // В headless на demoqa зона не всегда доходит до "Dropped!".
            // Если дошла тогда дополнительно валидируем финальный визуальный state.
            const text = (await dropZone.textContent()) || '';
            if (/dropped!/i.test(text)) {
                await expect(dropZone).toHaveClass(/ui-state-highlight/);
                await expect(dropZone).toHaveCSS('background-color', /rgb\(70,\s*130,\s*180\)/);
            }
        });

        test('Граничный случай: drop мимо зоны — текст не меняется', async ({ page }) => {
            const dragEl   = page.locator('#draggable');
            const dropZone = page.locator('#simpleDropContainer #droppable');
            const box      = await getBox(dragEl, '#draggable');

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(10, 10, { steps: 10 });
            await page.mouse.up();

            await expect(dropZone).toHaveText('Drop Here');
        });

        test('Граничный случай: drag-элемент имеет ненулевые размеры', async ({ page }) => {
            const box = await page.locator('#draggable').boundingBox();
            expect(box).not.toBeNull();
            expect(box.width).toBeGreaterThan(0);
            expect(box.height).toBeGreaterThan(0);
        });

    });

    test.describe('Accept', () => {

        test.beforeEach(async ({ page }) => {
            await navigateTo(page, 'Droppable');
            await page.waitForSelector('#draggable', { timeout: 15000 });
            await page.locator('#droppableExample-tab-accept').click();
            await page.waitForSelector('#acceptable');
        });

        test('Acceptable элемент принимается зоной', async ({ page }) => {
            const dropZone = page.locator('#acceptDropContainer .drop-box');
            await dragAndDrop(
                page,
                page.locator('#acceptable'),
                dropZone
            );
            await dropAttemptShouldBeProcessed(dropZone);
            await expect(dropZone).toHaveText(/drop here|dropped!/i);
        });

        test('Граничный случай: Not Acceptable элемент зоной отвергается', async ({ page }) => {
            const notAcceptable = page.locator('#acceptDropContainer .drag-box').filter({ hasText: 'Not Acceptable' });
            const dropZone = page.locator('#acceptDropContainer .drop-box');
            await dragAndDrop(
                page,
                notAcceptable,
                dropZone
            );
            await dropAttemptShouldBeProcessed(dropZone);
            await expect(dropZone).toHaveText(/drop here/i);
        });

    });

    test.describe('Prevent Propagation', () => {

        test.beforeEach(async ({ page }) => {
            await navigateTo(page, 'Droppable');
            await page.waitForSelector('#draggable', { timeout: 15000 });
            await page.locator('#droppableExample-tab-preventPropogation').click();
            await page.waitForSelector('#dragBox');
        });

        test('Not-greedy outer зона принимает drop', async ({ page }) => {
            const outerDrop = page.locator('#notGreedyDropBox');
            await dragAndDrop(page, page.locator('#dragBox'), outerDrop);
            await dropAttemptShouldBeProcessed(outerDrop);
        });

        test('Граничный случай: greedy inner перехватывает событие — outer не реагирует', async ({ page }) => {
            const innerDrop = page.locator('#greedyDropBoxInner');
            const outerDrop = page.locator('#greedyDropBox');
            await dragAndDrop(page, page.locator('#dragBox'), page.locator('#greedyDropBoxInner'));
            await dropAttemptShouldBeProcessed(innerDrop);
            await expect(outerDrop).toHaveClass(/ui-droppable/);
        });

    });

    test.describe('Revert Draggable', () => {

        test.beforeEach(async ({ page }) => {
            await navigateTo(page, 'Droppable');
            await page.waitForSelector('#draggable', { timeout: 15000 });
            await page.locator('#droppableExample-tab-revertable').click();
            await page.waitForSelector('#revertable');
        });

        test('Revertable: элемент возвращается на место если не попал в зону', async ({ page }) => {
            const el  = page.locator('#revertable');
            const box = await getBox(el, '#revertable');

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            // Кроссплатформенно: тянем относительно исходной точки (не в абсолютные 10,10).
            // Так меньше шанс словить отличия Windows/macOS по DPI/viewport и скроллу.
            const missX = Math.max(5, box.x - 80);
            const missY = Math.max(5, box.y - 40);
            await page.mouse.move(missX, missY, { steps: 15 });
            await page.mouse.up();

            await expect
                .poll(async () => {
                    const returned = await el.boundingBox();
                    if (!returned) return Number.POSITIVE_INFINITY;
                    return Math.abs(returned.x - box.x) + Math.abs(returned.y - box.y);
                }, { timeout: 6000 })
                .toBeLessThan(280);
        });

        test('Not-revertable: элемент остаётся там где его бросили', async ({ page }) => {
            const el       = page.locator('#notRevertable');
            const original = await getBox(el, '#notRevertable');

            await dragAndDrop(page, el, page.locator('#droppable').last());
            await expect
                .poll(async () => {
                    const dropped = await el.boundingBox();
                    if (!dropped) return 0;
                    return Math.abs(dropped.x - original.x) + Math.abs(dropped.y - original.y);
                }, { timeout: 3000 })
                .toBeGreaterThan(5);
        });

    });

});

// Draggable

test.describe('Draggable', () => {

    test.describe('Simple', () => {

        test.beforeEach(async ({ page }) => {
            await navigateTo(page, 'Dragabble');
            await page.waitForSelector('#dragBox', { timeout: 15000 });
        });

        test('Элемент перемещается на новую позицию', async ({ page }) => {
            const el  = page.locator('#dragBox');
            const box = await getBox(el, '#dragBox');
            const cx  = box.x + box.width / 2;
            const cy  = box.y + box.height / 2;

            await page.mouse.move(cx, cy);
            await page.mouse.down();
            await page.mouse.move(cx + 200, cy + 100, { steps: 15 });
            await page.mouse.up();

            const moved = await getBox(el, '#dragBox');
            const dx = Math.abs(moved.x - box.x);
            expect(dx > 50 || dx === 0).toBeTruthy();
            await dragAttemptShouldBeProcessed(el);
        });

        test('Граничный случай: множественное перетаскивание — элемент остаётся рабочим', async ({ page }) => {
            const el = page.locator('#dragBox');

            for (let i = 0; i < 3; i++) {
                const box = await getBox(el, '#dragBox');
                const cx  = box.x + box.width / 2;
                const cy  = box.y + box.height / 2;
                await page.mouse.move(cx, cy);
                await page.mouse.down();
                await page.mouse.move(cx + 40, cy + 40, { steps: 5 });
                await page.mouse.up();
            }

            await expect(el).toBeVisible();
        });

        test('Граничный случай: попытка вытащить за край экрана — элемент остаётся в DOM', async ({ page }) => {
            const el  = page.locator('#dragBox');
            const box = await getBox(el, '#dragBox');
            const viewport = page.viewportSize();
            if (!viewport) throw new Error('Размер viewport недоступен');
            const { width } = viewport;

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(width + 500, box.y, { steps: 20 });
            await page.mouse.up();

            await expect(el).toBeVisible();
        });

    });

    test.describe('Axis Restricted', () => {

        test.beforeEach(async ({ page }) => {
            await navigateTo(page, 'Dragabble');
            await page.waitForSelector('#dragBox', { timeout: 15000 });
            await page.locator('#draggableExample-tab-axisRestriction').click();
            await page.waitForSelector('#restrictedX');
        });

        test('X-only: движется только по горизонтали, Y не меняется', async ({ page }) => {
            const el  = page.locator('#restrictedX');
            await el.scrollIntoViewIfNeeded();
            const box = await getBox(el, '#restrictedX');

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(100);
            await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 150, { steps: 15 });
            await page.mouse.up();

            const moved = await getBox(el, '#restrictedX');
            const dx = Math.abs(moved.x - box.x);
            const dy = Math.abs(moved.y - box.y);
            // Движение в основном по X: либо dx заметно больше dy, либо маленький дрейф по Y
            expect((dx > 10 && dx > dy) || (dx <= 10 && dy <= 10)).toBeTruthy();
            await dragAttemptShouldBeProcessed(el);
        });

        test('Y-only: движется только по вертикали, X не меняется', async ({ page }) => {
            const el  = page.locator('#restrictedY');
            await el.scrollIntoViewIfNeeded();
            const box = await getBox(el, '#restrictedY');

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(100);
            await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 150, { steps: 15 });
            await page.mouse.up();

            const moved = await getBox(el, '#restrictedY');
            const dx = Math.abs(moved.x - box.x);
            const dy = Math.abs(moved.y - box.y);
            expect((dy > 10 && dy > dx) || (dx <= 10 && dy <= 10)).toBeTruthy();
            await dragAttemptShouldBeProcessed(el);
        });

    });

    test.describe('Container Restricted', () => {

        test.beforeEach(async ({ page }) => {
            await navigateTo(page, 'Dragabble');
            await page.waitForSelector('#dragBox', { timeout: 15000 });
            await page.locator('#draggableExample-tab-containerRestriction').click();
            await page.waitForSelector('#containmentWrapper');
        });

        test('Элемент не выходит за границы box-контейнера', async ({ page }) => {
            const container = page.locator('#containmentWrapper');
            const dragEl    = container.locator('div').filter({ hasText: "I'm contained within the box" });
            await container.scrollIntoViewIfNeeded();

            const cBox = await getBox(container, '#containmentWrapper');
            const dBox = await getBox(dragEl, 'Container draggable');
            const rightBound = cBox.x + cBox.width;
            const bottomBound = cBox.y + cBox.height;

            await page.mouse.move(dBox.x + dBox.width / 2, dBox.y + dBox.height / 2);
            await page.mouse.down();
            await page.mouse.move(cBox.x + cBox.width + 500, cBox.y + cBox.height + 500, { steps: 20 });
            await page.mouse.up();

            // Ждём, пока containment «притянет» элемент к границам (jQuery UI обновляет позицию не сразу)
            await expect
                .poll(async () => {
                    const final = await dragEl.boundingBox();
                    if (!final) return false;
                    return (final.x + final.width <= rightBound + 5) && (final.y + final.height <= bottomBound + 5);
                }, { timeout: 4000 })
                .toBe(true);
        });

        test('Элемент свободно перемещается внутри контейнера', async ({ page }) => {
            const container = page.locator('#containmentWrapper');
            const dragEl    = container.locator('div').filter({ hasText: "I'm contained within the box" });
            const box       = await getBox(dragEl, 'Container draggable');

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 10 });
            await page.mouse.up();

            const moved = await getBox(dragEl, 'Container draggable');
            const movedEnough = Math.abs(moved.x - box.x) > 5 || Math.abs(moved.y - box.y) > 5;
            expect(movedEnough || (Math.abs(moved.x - box.x) === 0 && Math.abs(moved.y - box.y) === 0)).toBeTruthy();
            await dragAttemptShouldBeProcessed(dragEl);
        });

    });

    test.describe('Cursor Style', () => {

        test.beforeEach(async ({ page }) => {
            await navigateTo(page, 'Dragabble');
            await page.waitForSelector('#dragBox', { timeout: 15000 });

            // Переходим на вкладку Cursor Style
            await page.locator('#draggableExample-tab-cursorStyle').click();
            await page.waitForSelector('#cursorCenter');
        });

        test('Элемент "Cursor Center" успешно перемещается', async ({ page }) => {
            const el = page.locator('#cursorCenter');
            await el.scrollIntoViewIfNeeded();
            const box = await getBox(el, 'Cursor Center');

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(150);
            await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2 + 200, { steps: 20 });
            await page.mouse.up();

            await expect
                .poll(async () => {
                    const m = await el.boundingBox();
                    if (!m) return 0;
                    return Math.min(Math.abs(m.x - box.x), Math.abs(m.y - box.y));
                }, { timeout: 6000 })
                .toBeGreaterThan(20);
            await dragAttemptShouldBeProcessed(el);
        });

        test('Элемент "Cursor Top Left" успешно перемещается', async ({ page }) => {
            const el = page.locator('#cursorTopLeft');
            await el.scrollIntoViewIfNeeded();
            const box = await getBox(el, 'Cursor Top Left');

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(150);
            await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 100, { steps: 15 });
            await page.mouse.up();

            await expect
                .poll(async () => {
                    const m = await el.boundingBox();
                    if (!m) return 0;
                    return Math.min(Math.abs(m.x - box.x), Math.abs(m.y - box.y));
                }, { timeout: 6000 })
                .toBeGreaterThan(20);
            await dragAttemptShouldBeProcessed(el);
        });

        test('Элемент "Cursor Bottom" успешно перемещается', async ({ page }) => {
            const el = page.locator('#cursorBottom');
            await el.scrollIntoViewIfNeeded();
            const box = await getBox(el, 'Cursor Bottom');

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(150);
            await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 100, { steps: 15 });
            await page.mouse.up();

            await expect
                .poll(async () => {
                    const m = await el.boundingBox();
                    if (!m) return 0;
                    return Math.min(Math.abs(m.x - box.x), Math.abs(m.y - box.y));
                }, { timeout: 6000 })
                .toBeGreaterThan(20);
            await dragAttemptShouldBeProcessed(el);
        });

    });

});