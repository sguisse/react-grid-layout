#!/usr/bin/env node
const { chromium } = require('@playwright/test');
(async () => {
  const url = 'http://localhost:4002/index-dev.html';
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('[PAGEERROR]', err && err.message ? err.message : String(err)));
    console.log('navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('.react-grid-item', { timeout: 20000 });
    // get initial properties
    const before = await page.evaluate(() => {
      const el = document.querySelector('.react-grid-item');
      return el ? { outerHTML: el.outerHTML.slice(0,1000), style: el.getAttribute('style'), computedTransform: window.getComputedStyle(el).transform } : null;
    });
    console.log('BEFORE', JSON.stringify(before));

    const item = (await page.$$('.react-grid-item'))[0];
    const box = await item.boundingBox();
    const startX = box.x + box.width/2;
    const startY = box.y + box.height/2;
    console.log('Start mouse at', startX, startY);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(startX + 180, startY + 10, { steps: 15 });
    await page.waitForTimeout(250);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const el = document.querySelector('.react-grid-item');
      return el ? { outerHTML: el.outerHTML.slice(0,1000), style: el.getAttribute('style'), computedTransform: window.getComputedStyle(el).transform } : null;
    });
    console.log('AFTER', JSON.stringify(after));
    const classlist = await page.evaluate(() => {
      const el = document.querySelector('.react-grid-item');
      return el ? Array.from(el.classList) : [];
    });
    console.log('classlist', JSON.stringify(classlist));
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error('ERROR_IN_SCRIPT', e);
    process.exit(2);
  }
})();
