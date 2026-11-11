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

test('cards toggle closed without saving an answer, and character details stay separate', async ({page}) => {
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'Study cards',exact:true}).click();
 await page.getByRole('button',{name:'Start studying',exact:true}).click();
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await expect(page.getByRole('button',{name:'Hide answer',exact:true})).toHaveAttribute('aria-expanded','true');
 await page.locator('.character-explorer > summary').click();
 await expect(page.locator('.character-reference')).toBeVisible();
 await page.getByRole('button',{name:'Hide answer',exact:true}).click();
 await expect(page.locator('.card-answer')).toHaveCount(0);
 await expect(page.locator('.character-reference')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Know',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Still learning',exact:true})).toBeDisabled();
 await expect(page.locator('.session-header')).toContainText('1 / 20');
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress).length)).toBe(0);
 // Native keyboard activation toggles the focused card exactly once.
 await page.getByRole('button',{name:'Reveal answer',exact:true}).press('Space');
 await expect(page.getByRole('button',{name:'Hide answer',exact:true})).toBeVisible();
 await expect(page.locator('.character-explorer')).not.toHaveAttribute('open','');
 await page.getByRole('button',{name:'Hide answer',exact:true}).press('Space');
 await expect(page.getByRole('button',{name:'Reveal answer',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await page.getByRole('button',{name:'Star prompt',exact:true}).press('Space');
 await expect(page.getByRole('button',{name:'Unstar prompt',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Hide answer',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

const sharedId = 'a3278291-32e0-4dbb-bbcb-013968d04c98';
const sharedWords = [
 {id:'shared-one',setId:'source-set',traditional:'學生',english:'student',pinyin:'xuéshēng',numbered:'xue2 sheng1',alignment:[{character:'學',pinyin:'xué'},{character:'生',pinyin:'shēng'}],alignmentReview:false,notes:'Class vocabulary',tags:['school']},
 {id:'shared-two',setId:'source-set',traditional:'老師',english:'teacher',pinyin:'lǎoshī',numbered:'lao3 shi1',alignment:[{character:'老',pinyin:'lǎo'},{character:'師',pinyin:'shī'}],alignmentReview:false,notes:'',tags:[]},
];
const sharedSet = {id:sharedId,name:'Shared class words',entries:sharedWords,updatedAt:'2026-11-07T10:00:00.000Z'};

test('Explore searches and paginates public sets, previews character details and saves a separate copy',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const publicDeck={...sharedSet,isPublic:true,description:'Vocabulary for class',creatorName:'Class learner'};
 const summary={id:sharedId,name:publicDeck.name,description:publicDeck.description,creatorName:publicDeck.creatorName,wordCount:2,updatedAt:publicDeck.updatedAt};
 const secondId='c3278291-32e0-4dbb-bbcb-013968d04c98';
 const searches:string[]=[];
 await page.route('**/api/community?**',route=>{
  const url=new URL(route.request().url());searches.push(url.search);
  const q=url.searchParams.get('q');
  return route.fulfill({json:q==='nothing'?{sets:[],nextCursor:null}:url.searchParams.has('cursor')?{sets:[{...summary,id:secondId,name:'Second set'}],nextCursor:null}:{sets:[summary],nextCursor:`2026-11-07T10:00:00.000Z|${sharedId}`}});
 });
 await page.route(`**/api/shares/${sharedId}`,route=>route.fulfill({json:publicDeck}));
 await page.goto('/explore');
 await expect(page.getByRole('heading',{name:'Explore',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/Shared class words/})).toBeVisible();
 await expect(page.getByText('By Class learner',{exact:true})).toBeVisible();
 expect(searches).toHaveLength(1);
 await page.getByRole('button',{name:'Show more sets',exact:true}).click();
 await expect(page.getByRole('link',{name:/Second set/})).toBeVisible();
 await page.getByRole('textbox',{name:'Search public sets'}).fill('nothing');
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await expect(page.getByRole('heading',{name:'No matching sets',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Search public sets'}).fill('class');
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await expect(page.getByRole('link',{name:/Shared class words/})).toBeVisible();
 await page.screenshot({path:'test-results/explore-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('link',{name:/Shared class words/}).click();
 await expect(page.getByRole('heading',{name:sharedSet.name,exact:true})).toBeVisible();
 await expect(page.getByText('PUBLIC SET',{exact:true})).toBeVisible();
 await page.getByText('Character details',{exact:true}).first().click();
 await expect(page.getByRole('article',{name:'Character reference for 學'})).toBeVisible();
 await page.getByRole('button',{name:'Report this set',exact:true}).click();
 await expect(page.getByText('Sign in to report a set.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/explore-preview-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Explore',exact:true}).last().click();
 await expect(page.getByRole('textbox',{name:'Search public sets'})).toHaveValue('class');
 await page.getByRole('link',{name:/Shared class words/}).click();
 await page.getByRole('button',{name:'Add to library',exact:true}).click();
 await expect(page.getByRole('heading',{name:sharedSet.name+'.',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Explore',exact:true}).first().click();
 await expect(page.getByRole('link',{name:/Shared class words/})).toContainText('In your library');
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 expect(state.sets.filter((s:{sourceShareId?:string})=>s.sourceShareId===sharedId)).toHaveLength(1);
 expect(state.progress).toEqual({});
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:'test-results/explore-desktop.png',fullPage:true});
});

test('Explore handles offline failure, retry and an empty community without changing the library',async({page,context})=>{
 let fail=true,offline=false;
 await page.route('**/api/community?**',route=>offline?route.abort('internetdisconnected'):route.fulfill(fail?{status:503,json:{error:'Unavailable'}}:{json:{sets:[],nextCursor:null}}));
 await page.goto('/explore');
 await expect(page.locator('.explore-page [role=alert]')).toContainText('Could not load public sets');
 fail=false;await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('heading',{name:'No public sets yet',exact:true})).toBeVisible();
 const before=await page.evaluate(()=>localStorage.getItem('mori-v2:guest'));
 await page.getByRole('button',{name:'Open your library',exact:true}).click();
 offline=true;await context.setOffline(true);
 await page.getByRole('button',{name:'Explore',exact:true}).click();
 await expect(page.locator('.explore-page [role=alert]')).toContainText('Connect to the internet');
 offline=false;await context.setOffline(false);
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('heading',{name:'No public sets yet',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('mori-v2:guest'))).toBe(before);
});

test('shared set preview saves an independent copy, studies offline and avoids duplicate copies',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route(`**/api/shares/${sharedId}`,route=>route.fulfill({json:sharedSet}));
 await page.goto(`/share/${sharedId}`);
 await expect(page.getByRole('heading',{name:sharedSet.name,exact:true})).toBeVisible();
 await expect(page.locator('.shared-word')).toHaveCount(2);
 await page.screenshot({path:'test-results/shared-390.png',fullPage:true});
 await expect(page.getByRole('region',{name:'Browser-only storage'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Save to folder',{exact:true}).selectOption('mandarin-class');
 await page.getByRole('button',{name:'Add to library',exact:true}).click();
 await expect(page.getByRole('heading',{name:sharedSet.name+'.',exact:true})).toBeVisible();
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 const saved=state.sets.find((s:{sourceShareId?:string})=>s.sourceShareId==='a3278291-32e0-4dbb-bbcb-013968d04c98');
 expect(saved).toBeTruthy();expect(saved.id).not.toBe('source-set');
 const copied=state.entries.filter((e:{setId:string})=>e.setId===saved.id);
 expect(copied).toHaveLength(2);expect(copied.map((e:{id:string})=>e.id)).not.toContain('shared-one');
 expect(copied[0].notes).toBe('Class vocabulary');expect(copied[0].tags).toEqual(['school']);
 expect(state.progress).toEqual({});expect(state.stars).toEqual({});
 await page.getByRole('button',{name:'Study set',exact:true}).click();
 await page.getByRole('button',{name:'Start studying',exact:true}).click();
 // Once copied, studying does not depend on the sharing endpoint or network.
 await context.setOffline(true);
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await page.getByRole('button',{name:'Know',exact:true}).click();
 await expect(page.locator('.session-header')).toContainText('2 / 2');
 await context.setOffline(false);
 await page.goto(`/share/${sharedId}`);
 await expect(page.getByRole('button',{name:'Open your copy',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Add to library',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Open your copy',exact:true}).click();
 await expect(page.getByRole('heading',{name:sharedSet.name+'.',exact:true})).toBeVisible();
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 expect(restored.sets.filter((s:{sourceShareId?:string})=>s.sourceShareId==='a3278291-32e0-4dbb-bbcb-013968d04c98')).toHaveLength(1);
 expect(Object.keys(restored.progress)).toHaveLength(1);
 expect(restored.progress[copied[0].id+':chinese'].lastResult).toBe('know');
});

test('unavailable shared links explain failure and can retry without adding a set',async({page})=>{
 let available=false;
 await page.route(`**/api/shares/${sharedId}`,route=>available?route.fulfill({json:sharedSet}):route.fulfill({status:404,json:{error:'This shared set is unavailable.'}}));
 await page.goto(`/share/${sharedId}`);
 await expect(page.getByRole('heading',{name:'Set unavailable',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Add to library',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('mori-v2:guest')!).state.sets)).toHaveLength(1);
 available=true;
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('heading',{name:sharedSet.name,exact:true})).toBeVisible();
});

test('guests cannot publish shared links',async({page})=>{
 let published=0;
 await page.route('**/api/shares**',route=>{published++;return route.fulfill({status:401,json:{error:'Sign in'}});});
 await page.goto('/');
 await page.locator('.set-open').first().click();
 await page.getByRole('button',{name:'Share',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('heading',{name:'Share set',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create link',exact:true})).toHaveCount(0);
 expect(published).toBe(0);
});

test('character reference is optional, navigable, keyboard-safe and available offline', async ({page, context}) => {
 await page.setViewportSize({width:390,height:844});
 const external: string[]=[];
 page.on('request', r=>{if(r.url().includes('dong-chinese.com')) external.push(r.url());});
 await page.goto('/');
 await page.getByRole('button',{name:'Study cards',exact:true}).click();
 await page.getByRole('button',{name:'Start studying',exact:true}).click();
 await expect(page.locator('.character-explorer')).toHaveCount(0);
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await page.locator('.character-explorer > summary').press('Space');
 const reference=page.getByRole('article',{name:'Character reference for 你'});
 await expect(reference).toContainText('Verified on Dong Chinese');
 await expect(reference).toContainText('亻');
 await reference.getByText('Common words',{exact:true}).click();
 await expect(reference.getByText('你好',{exact:true})).toBeVisible();
 await reference.getByText('Stroke order',{exact:true}).click();
 await expect(page.getByRole('img',{name:'Stroke order for 你: 7 of 7 strokes'})).toBeVisible();
 await page.screenshot({path:'test-results/character-strokes-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Reset strokes'}).click();
 await page.getByRole('button',{name:'Next stroke',exact:true}).press('ArrowRight');
 await expect(page.locator('.session-header')).toContainText('1 / 20');
 await page.getByRole('button',{name:'Next stroke',exact:true}).click();
 await expect(page.getByRole('img',{name:'Stroke order for 你: 1 of 7 strokes'})).toBeVisible();
 await page.getByRole('button',{name:'Play',exact:true}).click();
 await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 await reference.getByRole('button',{name:'Explore component 亻',exact:true}).click();
 await expect(page.getByRole('article',{name:'Character reference for 亻'})).toBeVisible();
 await page.getByRole('button',{name:'Explore 你',exact:true}).click();
 await expect(reference).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(external).toEqual([]);
 expect(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('mori-v2:guest')!).state.progress).length)).toBe(0);
 await page.screenshot({path:'test-results/character-details-mobile.png',fullPage:true});
 // Clear in-memory modules by reloading. Public dictionary shards survive in CacheStorage.
 await page.reload();
 await context.setOffline(true);
 await page.getByRole('button',{name:'Study cards',exact:true}).click();
 await page.getByRole('button',{name:'Start studying',exact:true}).click();
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await page.locator('.character-explorer > summary').click();
 await expect(reference).toContainText('Verified on Dong Chinese');
 await reference.getByText('Stroke order',{exact:true}).click();
 await expect(page.getByRole('img',{name:'Stroke order for 你: 7 of 7 strokes'})).toBeVisible();
 await context.setOffline(false);
});

test('character reference failures retry without interrupting study', async ({page, context}) => {
 await page.goto('/');
 await context.setOffline(true);
 await page.getByRole('button',{name:'Study cards',exact:true}).click();
 await page.getByRole('button',{name:'Start studying',exact:true}).click();
 await page.getByRole('button',{name:'Reveal answer',exact:true}).click();
 await page.locator('.character-explorer > summary').click();
 await expect(page.getByText(/Character details couldn’t load/)).toBeVisible();
 await context.setOffline(false);
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('article',{name:'Character reference for 你'})).toBeVisible();
 await page.getByRole('button',{name:'Know',exact:true}).click();
 await expect(page.locator('.session-header')).toContainText('2 / 20');
 await expect(page.locator('.character-explorer')).toHaveCount(0);
});

test('word editor explores exact traditional characters, deduplicates them and handles missing references', async ({page}) => {
 await page.setViewportSize({width:1440,height:1000});
 await page.goto('/');
 await page.locator('.set-open').first().click();
 await page.getByRole('button',{name:'Add word',exact:true}).click();
 await page.getByLabel('Traditional Chinese',{exact:true}).fill('謝謝，學𱍐');
 await page.locator('.character-explorer > summary').click();
 await expect(page.getByRole('group',{name:'Choose a character'}).getByRole('button')).toHaveCount(3);
 const thanks=page.getByRole('article',{name:'Character reference for 謝'});
 await expect(thanks).toContainText('言 represents the meaning and 射 represents the sound');
 await thanks.getByText('Common words',{exact:true}).click();
 await expect(thanks.getByText('謝謝',{exact:true})).toBeVisible();
 await thanks.getByText('Historical forms',{exact:true}).click();
 await expect(thanks.getByRole('link',{name:'View evolution on Dong Chinese'})).toHaveAttribute('href','https://www.dong-chinese.com/wiki/%E8%AC%9D');
 await page.screenshot({path:'test-results/character-details-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Explore 學',exact:true}).click();
 await expect(page.getByRole('article',{name:'Character reference for 學'})).toBeVisible();
 await page.getByRole('button',{name:'Explore 𱍐',exact:true}).click();
 await expect(page.getByText('No local reference for this character.')).toBeVisible();
 await expect(page.getByRole('link',{name:'Look up 𱍐 on Dong Chinese'})).toBeVisible();
 await page.getByRole('button',{name:'Close dialog'}).click();
 await expect(page.locator('.word-row')).toHaveCount(55);
});


test('public folders keep set structure, save once, preserve progress and work offline after copying', async ({ page, context }) => {
 await page.setViewportSize({ width: 390, height: 844 });
 const id = 'b3278291-32e0-4dbb-bbcb-013968d04c98';
 const folder = { ...sharedSet, id, kind: 'folder', name: 'Mandarin course', isPublic: true, creatorName: 'Course teacher',
  description: 'Two units for class', sets: [{ id: 'source-set', name: 'Unit A' }, { id: 'second-set', name: 'Unit B' }],
  entries: [sharedWords[0], { ...sharedWords[1], setId: 'second-set' }] };
 const searches: string[] = [];
 await page.route('**/api/community?**', route => {
  const url = new URL(route.request().url()); searches.push(url.search);
  return route.fulfill({ json: { sets: url.searchParams.get('kind') === 'set' ? [] : [{ ...folder, entries: undefined, sets: undefined, setCount: 2, wordCount: 2 }], nextCursor: null } });
 });
 let revoked = false;
 await page.route(`**/api/shares/${id}`, route => revoked ? route.fulfill({ status: 404, json: {} }) : route.fulfill({ json: folder }));
 await page.goto('/');
 await page.locator('.set-open').first().click();
 await page.getByRole('button', { name: 'Study set', exact: true }).click();
 await page.getByRole('button', { name: 'Start studying', exact: true }).click();
 await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
 await page.getByRole('button', { name: 'Know', exact: true }).click();
 page.on('dialog', dialog => dialog.accept());
 await page.getByRole('button', { name: 'End session', exact: true }).click();
 const before = await page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 await page.getByRole('button', { name: 'Explore', exact: true }).first().click();
 await page.getByRole('group', { name: 'Content type' }).getByRole('button', { name: 'Folders', exact: true }).click();
 await expect(page.getByRole('link', { name: /Mandarin course/ })).toContainText('Folder · 2 sets · 2 words');
 expect(searches.at(-1)).toContain('kind=folder');
 await page.getByRole('link', { name: /Mandarin course/ }).click();
 await expect(page.getByText('PUBLIC FOLDER', { exact: true })).toBeVisible();
 await expect(page.getByRole('combobox', { name: 'Save to folder' })).toHaveCount(0);
 await expect(page.locator('.shared-word')).toHaveCount(0);
 await page.locator('.shared-folder-set > summary').filter({ hasText: 'Unit A' }).click();
 await expect(page.locator('.shared-word')).toHaveCount(1);
 await expect(page.getByText('學生', { exact: true })).toBeVisible();
 await page.screenshot({ path: 'test-results/folder-preview-mobile.png', fullPage: true });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.setViewportSize({ width: 1440, height: 1000 });
 await page.screenshot({ path: 'test-results/folder-preview-desktop.png', fullPage: true });
 await page.getByRole('button', { name: 'Add folder to library', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Mandarin course', exact: true })).toBeVisible();
 await expect(page.locator('.set-card')).toHaveCount(2);
 const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 const copy = saved.folders.find((f: { sourceShareId?: string }) => f.sourceShareId === id);
 const sets = saved.sets.filter((s: { folderId: string }) => s.folderId === copy.id);
 expect(sets.map((s: { name: string }) => s.name)).toEqual(['Unit A', 'Unit B']);
 expect(sets.every((s: { id: string }) => !['source-set', 'second-set'].includes(s.id))).toBe(true);
 expect(saved.entries.filter((e: { setId: string }) => sets.some((s: { id: string }) => s.id === e.setId))).toHaveLength(2);
 expect(saved.progress).toEqual(before.progress); expect(saved.stars).toEqual(before.stars);
 expect(saved.entries.slice(0, before.entries.length)).toEqual(before.entries);
 await page.goto(`/share/${id}`);
 await expect(page.getByRole('button', { name: 'Open your copy', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Open your copy', exact: true }).click();
 const again = await page.evaluate(() => JSON.parse(localStorage.getItem('mori-v2:guest')!).state);
 expect(again.folders.filter((f: { sourceShareId?: string }) => f.sourceShareId === id)).toHaveLength(1);
 await page.getByRole('button', { name: 'Manage Mandarin course', exact: true }).click();
 await page.getByRole('button', { name: 'Archive', exact: true }).click();
 await page.goto(`/share/${id}`);
 await page.getByRole('button', { name: 'Open your copy', exact: true }).click();
 await expect(page.locator('.set-card')).toHaveCount(2);
 revoked = true;
 await page.goto(`/share/${id}`);
 await expect(page.getByRole('heading', { name: 'Set unavailable', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Open your copy', exact: true }).click();
 await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })); });
 await context.setOffline(true); await page.reload();
 await page.getByRole('navigation', { name: 'Library', exact: true }).getByRole('button', { name: 'Mandarin course', exact: true }).click();
 await page.locator('.set-open').filter({ hasText: 'Unit A' }).click();
 await page.getByRole('button', { name: 'Study set', exact: true }).click();
 await page.getByRole('button', { name: 'Start studying', exact: true }).click();
 await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
 await expect(page.getByText('student', { exact: true })).toBeVisible();
 await context.setOffline(false);
});

test('guests are prompted to sign in before publishing a folder', async ({ page }) => {
 let published = 0;
 await page.route('**/api/shares**', route => { published++; return route.fulfill({ status: 401, json: {} }); });
 await page.goto('/');
 await page.getByRole('navigation', { name: 'Library', exact: true }).getByRole('button', { name: 'Mandarin Class', exact: true }).click();
 await page.getByRole('button', { name: 'Share folder', exact: true }).click();
 await expect(page.getByRole('dialog')).toContainText('Create an account or sign in to share this folder.');
 expect(published).toBe(0);
});
