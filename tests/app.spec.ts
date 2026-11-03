import {test,expect} from '@playwright/test';
import path from 'node:path';

test('create and edit vocabulary, aligned pronunciation, independent fronts and stars',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'A little Mandarin, every day.'})).toBeVisible();
 await page.getByRole('button',{name:'Create folder',exact:true}).first().click();
 await page.getByLabel('Name',{exact:true}).fill('Test folder');
 await page.getByRole('button',{name:'Create',exact:true}).click();
 await page.getByRole('button',{name:'A new beginning Create a study set'}).click();
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
 await expect(page.getByRole('heading',{name:'Look at you grow.'})).toBeVisible();
 let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 const entry=state.entries.find((e:{english:string;setId:string})=>e.english==='student'&&e.setId!== 'unit-1');
 expect(state.progress[entry.id+':chinese'].reviewCount).toBe(1);
 expect(state.progress[entry.id+':english']).toBeUndefined();
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Study Test words',exact:true}).click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await page.getByRole('button',{name:'Star prompt',exact:true}).click();
 await page.keyboard.press('Space');
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
 await page.getByRole('button',{name:'My sets',exact:false}).first().click();
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
 await expect(page.getByRole('heading',{name:'A little Mandarin, every day.'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/home-${viewport.width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Let’s study'}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await page.getByRole('button',{name:'Reveal answer'}).click();
 await expect(page.getByRole('button',{name:'Know',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'End session'})).toBeVisible();
 await page.screenshot({path:`test-results/study-${viewport.width}.png`,fullPage:true});
});

test('local auth explanation, manifest and offline preservation',async({page,context})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Your quiet corner'}).click();
 await expect(page.getByRole('heading',{name:'You’re learning locally'})).toBeVisible();
 await page.getByRole('button',{name:'Keep learning'}).click();
 const manifest=await (await page.request.get('/manifest.webmanifest')).json();expect(manifest.display).toBe('standalone');expect(manifest.icons.length).toBeGreaterThan(0);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready});
 await page.getByRole('button',{name:'Let’s study'}).click();await page.getByRole('button',{name:'Start studying'}).click();
 await context.setOffline(true);
 await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');
 const progress=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress);expect(Object.keys(progress).length).toBe(1);
 await page.reload();await expect(page.getByRole('heading',{name:'A little Mandarin, every day.'})).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress).length)).toBe(1);
 await context.setOffline(false);
});

test('preview corrections and vertical import preserve user-confirmed pronunciation',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'My sets'}).first().click();
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

test('undo reverses the exact direction and removes a scheduled repeat',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Let’s study'}).click();
 await page.getByRole('button',{name:'Start studying'}).click();await page.keyboard.press('Space');await page.keyboard.press('ArrowLeft');
 await expect(page.locator('.session-header')).toContainText('/ 21');
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

test('mixed new cards choose an eligible front and keep its progress independent',async({page})=>{
 await page.goto('/');await page.getByRole('heading',{name:'A little Mandarin, every day.'}).waitFor();
 await page.evaluate(()=>{const stored=JSON.parse(localStorage.getItem('mori-v2:guest')!);const state=stored.state;state.entries=state.entries.slice(0,1);const id=state.entries[0].id;const progress={reviewCount:1,correctCount:1,incorrectCount:0,consecutiveCorrect:1,stage:1,lastResult:'know',lastReviewed:'2026-11-03T12:00:00.000Z',nextReview:'2028-11-03T12:00:00.000Z'};state.progress={[id+':chinese']:progress,[id+':english']:progress};state.preferences={prompt:'mixed',filter:'New',order:'Original',amount:'All'};localStorage.setItem('mori-v2:guest',JSON.stringify(stored))});
 await page.reload();await page.getByRole('button',{name:'Study Unit 1',exact:true}).click();
 await page.getByRole('button',{name:'Start studying'}).click();
 await expect(page.locator('.session-context')).toContainText('Pinyin');
 await page.keyboard.press('Space');await page.keyboard.press('ArrowRight');
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);const id=state.entries[0].id;
 expect(state.progress[id+':pinyin'].reviewCount).toBe(1);expect(state.progress[id+':chinese'].reviewCount).toBe(1);expect(state.progress[id+':english'].reviewCount).toBe(1);
});
