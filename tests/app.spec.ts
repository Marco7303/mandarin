import {test,expect} from '@playwright/test';
import path from 'node:path';

test('create and edit vocabulary, aligned pronunciation, independent fronts and stars',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Your study space'})).toBeVisible();
 await page.getByRole('button',{name:'Create folder',exact:true}).first().click();
 await page.getByLabel('Name',{exact:true}).fill('Test folder');
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await page.getByRole('button',{name:'Create a study set'}).click();
 await expect(page.getByRole('dialog')).toContainText('saved only in this browser');
 await page.getByRole('button',{name:'Continue in this browser',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Test words');
 await page.getByLabel('Folder',{exact:true}).selectOption({label:'Test folder'});
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await page.getByRole('button',{name:'Add word'}).first().click();
 await page.getByLabel('Traditional Chinese',{exact:true}).fill('學生');
 await page.getByLabel('Pinyin',{exact:true}).fill('xuéshēng');
 await page.getByLabel('English',{exact:true}).fill('student');
 await expect(page.getByLabel('Pronunciation for 學 1')).toHaveValue('xué');
 await expect(page.getByLabel('Pronunciation for 生 2')).toHaveValue('shēng');
 await page.getByRole('button',{name:'Save word'}).click();
 await page.getByRole('button',{name:'Study set',exact:true}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await page.keyboard.press('Space');
 await expect(page.getByText('xuéshēng',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Know',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Session complete'})).toBeVisible();
 let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 const entry=state.entries.find((e:{english:string;setId:string})=>e.english==='student'&&e.setId!== 'unit-1');
 expect(state.progress[entry.id+':chinese'].reviewCount).toBe(1);
 expect(state.progress[entry.id+':english']).toBeUndefined();
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Study Test words',exact:true}).click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await page.getByRole('button',{name:'Star prompt',exact:true}).click();
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await page.keyboard.press('ArrowRight');
 state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 expect(state.progress[entry.id+':chinese'].reviewCount).toBe(1);
 expect(state.progress[entry.id+':english'].reviewCount).toBe(1);
 expect(state.stars[entry.id+':english']).toBe(true);
 expect(state.stars[entry.id+':chinese']).toBeUndefined();
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Study Test words',exact:true}).click();
 await page.getByRole('button',{name:'Starred',exact:true}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await expect(page.getByRole('button',{name:'Reveal answer'})).toContainText('student');
});

test('CSV and supplied workbook import through preview',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'All sets',exact:false}).first().click();
 await page.getByRole('button',{name:'Import',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'test.csv',mimeType:'text/csv',buffer:Buffer.from('traditional,english,pinyin\n學生,student,xuéshēng\n你們,you,nǐmen')});
 await expect(page.getByText('2 words detected')).toBeVisible();
 await page.getByLabel('Destination',{exact:true}).selectOption('new');
 await page.getByLabel('Set name',{exact:true}).fill('CSV words');
 await page.getByRole('button',{name:'Import 2 words'}).click();
 await expect(page.getByText('nǐmen',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Import',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles(path.resolve('Mandarin_Unit_1_3_Fields_Anki.xlsx'));
 await expect(page.getByText('55 words detected')).toBeVisible();
 await expect(page.getByLabel('Import format')).toHaveValue('tabular');
 await page.getByLabel('Destination',{exact:true}).selectOption('new');
 await page.getByLabel('Set name',{exact:true}).fill('Workbook copy');
 await page.getByRole('button',{name:'Import 55 words'}).click();
 await expect(page.getByRole('heading',{name:'Workbook copy.'})).toBeVisible();
 await expect(page.locator('.word-row')).toHaveCount(55);
});

for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:900}])test(`responsive home and study ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');
 await expect(page.getByRole('heading',{name:'Your study space'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 if(viewport.width>=768){
  const library=page.getByRole('navigation',{name:'Library',exact:true});
  await library.getByRole('button',{name:'Mandarin Class',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Mandarin Class',exact:true})).toBeVisible();
  await expect(library.getByRole('button',{name:'Mandarin Class',exact:true})).toHaveAttribute('aria-current','page');
  await library.getByRole('button',{name:'All sets'}).click();
  await expect(page.getByRole('heading',{name:'All sets',exact:true})).toBeVisible();
  await expect(library.getByRole('button',{name:'All sets'})).toHaveAttribute('aria-current','page');
  await expect(library.getByRole('button',{name:'Mandarin Class',exact:true})).not.toHaveAttribute('aria-current','page');
  await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:'Home',exact:true}).click();
 }
 await page.screenshot({path:`test-results/home-${viewport.width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Study cards'}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.getByRole('button',{name:'Know',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'End session'})).toBeVisible();
 await page.screenshot({path:`test-results/study-${viewport.width}.png`,fullPage:true});
});

test('local auth explanation, manifest and offline preservation',async({page,context})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Account'}).click();
 await expect(page.getByRole('heading',{name:'Local storage'})).toBeVisible();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 const manifest=await (await page.request.get('/manifest.webmanifest')).json();expect(manifest.display).toBe('standalone');expect(manifest.icons.length).toBeGreaterThan(0);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready});
 await page.getByRole('button',{name:'Study cards'}).click();await page.getByRole('button',{name:'Start studying'}).click();
 await context.setOffline(true);
 await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress);expect(Object.keys(progress).length).toBe(1);
 await page.reload();await expect(page.getByRole('heading',{name:'Your study space'})).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress).length)).toBe(1);
 await context.setOffline(false);
});

test('preview corrections and vertical import preserve user-confirmed pronunciation',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'All sets'}).first().click();
 await page.getByRole('button',{name:'Import',exact:true}).click();
 await page.getByLabel('Paste vocabulary').fill('學生\t\tbadpinyin');
 await page.getByRole('button',{name:'Preview words'}).click();
 await expect(page.getByRole('button',{name:'Import 1 words'})).toBeDisabled();
 await page.getByLabel('english row 1',{exact:true}).fill('student');
 await page.getByLabel('pinyin row 1',{exact:true}).fill('xuéshēng');
 await expect(page.getByRole('button',{name:'Import 1 words'})).toBeEnabled();
 await page.getByLabel('Destination',{exact:true}).selectOption('new');
 await page.getByLabel('Set name',{exact:true}).fill('Corrected');
 await page.getByRole('button',{name:'Import 1 words'}).click();
 await page.getByRole('button',{name:'Edit 學生',exact:true}).click();
 await page.getByLabel('Pronunciation for 生 2').fill('shēng (first tone)');
 await page.getByRole('button',{name:'Save word'}).click();
 await page.getByRole('button',{name:'Edit 學生',exact:true}).click();
 await expect(page.getByLabel('Pronunciation for 生 2')).toHaveValue('shēng (first tone)');
 await page.getByRole('button',{name:'Close dialog'}).click();
 await page.getByRole('button',{name:'Import',exact:true}).click();
 await page.getByLabel('Paste vocabulary').fill('你\nyou\nnǐ\n們\nplural; suffix (neutral)\nmen');
 await page.getByRole('button',{name:'Preview words'}).click();
 await expect(page.getByLabel('Import format')).toHaveValue('vertical');
 await page.getByRole('button',{name:'Import 2 words'}).click();
 await expect(page.getByText('men',{exact:true})).toBeVisible();
});

test('Still learning leaves a card in Learning without extending the session, and undo restores its previous state',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Study cards'}).click();
 await page.getByRole('button',{name:'Start studying'}).click();await page.keyboard.press('Space');await page.keyboard.press('ArrowLeft');
 await expect(page.locator('.session-header')).toContainText('2 / 20');
 await page.getByRole('button',{name:'Undo last answer'}).click();
 await expect(page.locator('.session-header')).toContainText('1 / 20');
 await expect(page.getByRole('button',{name:'Know',exact:true})).toBeEnabled();
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 expect(Object.keys(state.progress)).toHaveLength(0);
 await page.keyboard.press('ArrowRight');
 await expect(page.locator('.session-header')).toContainText('2 / 20');
});

test('API refuses unauthenticated cloud access and validates dictionary input',async({request})=>{
 const response=await request.get('/api/sync');expect(response.status()).toBe(401);
 const dictionary=await request.get('/api/dictionary?q=hello');expect(dictionary.status()).toBe(400);
});

test('mixed Learning cards choose an eligible front and keep its progress independent',async({page})=>{
 await page.goto('/');await page.getByRole('heading',{name:'Your study space'}).waitFor();
 await page.evaluate(()=>{const stored=JSON.parse(localStorage.getItem('mori-v2:guest')!);const state=stored.state;state.entries=state.entries.slice(0,1);const id=state.entries[0].id;const progress={reviewCount:1,correctCount:1,incorrectCount:0,consecutiveCorrect:1,stage:1,lastResult:'know',lastReviewed:'2026-11-03T12:00:00.000Z',nextReview:'2028-11-03T12:00:00.000Z'};state.progress={[id+':chinese']:progress,[id+':english']:progress};state.preferences={prompt:'mixed',filter:'New',order:'Original',amount:'All'};localStorage.setItem('mori-v2:guest',JSON.stringify(stored))});
 await page.reload();await page.getByRole('button',{name:'Study Unit 1',exact:true}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await expect(page.locator('.session-context')).toContainText('Pinyin');
 await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);const id=state.entries[0].id;
 expect(state.progress[id+':pinyin'].reviewCount).toBe(1);expect(state.progress[id+':chinese'].reviewCount).toBe(1);expect(state.progress[id+':english'].reviewCount).toBe(1);
});


test('learned cards stay done; words and sets can be reset without losing stars', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');await page.getByRole('heading',{name:'Your study space'}).waitFor();
 await page.evaluate(()=>{const stored=JSON.parse(localStorage.getItem('mori-v2:guest')!);stored.state.entries=stored.state.entries.slice(0,2);stored.state.preferences={prompt:'chinese',filter:'Due',order:'Review order',amount:'All'};localStorage.setItem('mori-v2:guest',JSON.stringify(stored))});
 await page.reload();await page.getByRole('button',{name:'Study Unit 1',exact:true}).click();
 await expect(page.getByRole('button',{name:'Learning',exact:true})).toHaveClass(/selected/);
 await expect(page.getByRole('button',{name:'Due',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Start studying'}).click();
 await page.getByRole('button',{name:'Star prompt',exact:true}).click();
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();await page.keyboard.press('ArrowRight');
 await page.keyboard.press('Space');await page.keyboard.press('ArrowLeft');
 await expect(page.getByRole('heading',{name:'Session complete'})).toBeVisible();
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.reload();await page.getByRole('button',{name:'Study Unit 1',exact:true}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await expect(page.locator('.session-header')).toContainText('1 / 1');
 await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Study Unit 1',exact:true}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await expect(page.getByRole('status')).toContainText('All learned for this front!');
 await page.getByRole('button',{name:'Learned',exact:true}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await expect(page.locator('.session-header')).toContainText('1 / 2');
 // Undo restores Learned after practising a learned card as Still learning.
 await page.keyboard.press('Space');await page.keyboard.press('ArrowLeft');
 await page.getByRole('button',{name:'Undo last answer'}).click();
 expect(await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress).every((p)=> (p as {lastResult:string}).lastResult==='know'))).toBe(true);
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'End session'}).click();
 await page.locator('.set-open').first().click();
 await page.getByRole('button',{name:/^Edit /}).first().click();
 await page.getByRole('button',{name:'Move back to Learning',exact:true}).click();
 await expect(page.getByText('Learning in all fronts.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close dialog'}).click();
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress).length)).toBe(1);
 await page.getByRole('button',{name:'Reset progress',exact:true}).click();
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 expect(Object.keys(state.progress)).toHaveLength(0);expect(state.entries).toHaveLength(2);expect(Object.values(state.stars)).toContain(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('guest set creation explains browser storage and can be cancelled or continued locally', async ({page}) => {
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await expect(page.getByRole('region',{name:'Browser-only storage'})).toContainText('Clearing browser data will delete your sets and progress.');
 await page.getByRole('button',{name:'Create a study set',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('saved only in this browser');
 await expect(page.getByLabel('Name',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Close dialog'}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state.sets.length)).toBe(1);
 await page.getByRole('button',{name:'Sets',exact:true}).click();
 await page.getByRole('button',{name:'Create set',exact:true}).click();
 await page.getByRole('button',{name:'Continue in this browser',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Local set');
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Local set.'})).toBeVisible();
 await page.reload();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state.sets.some((s:{name:string})=>s.name==='Local set'))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('cards toggle closed without saving an answer, and character pinyin stays separate', async ({page}) => {
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'Study cards',exact:true}).click();
 await page.getByRole('button',{name:'Start studying',exact:true}).click();
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await expect(page.getByRole('button',{name:'Hide answer',exact:true})).toHaveAttribute('aria-expanded','true');
 await page.getByRole('button',{name:'Show pinyin by character',exact:true}).click();
 await expect(page.locator('.character-alignment')).toBeVisible();
 await page.getByRole('button',{name:'Hide answer',exact:true}).click();
 await expect(page.locator('.card-answer')).toHaveCount(0);
 await expect(page.locator('.character-alignment')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Know',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Still learning',exact:true})).toBeDisabled();
 await expect(page.locator('.session-header')).toContainText('1 / 20');
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress).length)).toBe(0);
 // Native keyboard activation toggles the focused card exactly once.
 await page.getByRole('button',{name:'Reveal answer',exact:true}).press('Space');
 await expect(page.getByRole('button',{name:'Hide answer',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Show pinyin by character',exact:true})).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:'Hide answer',exact:true}).press('Space');
 await expect(page.getByRole('button',{name:'Reveal answer',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await page.getByRole('button',{name:'Star prompt',exact:true}).press('Space');
 await expect(page.getByRole('button',{name:'Unstar prompt',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Hide answer',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
