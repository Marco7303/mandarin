/** Small, deterministic Hanyu Pinyin normalizer. No dictionary guesses are applied. */
const syllables = new Set(`a ai an ang ao e ei en eng er o ou ong m n ng hm hng ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu fa fan fang fei fen feng fo fou fu da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nü nüe nuan nuo la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu lü lüe luan lun luo ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo ca cai can cang cao ce cen ceng ci cong cou cu cuan cui cun cuo sa sai san sang sao se sen seng si song sou su suan sui sun suo ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun wa wai wan wang wei wen weng wo wu`.split(' '));
const marks: Record<string, string> = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
export type PinyinResult = {
    marked: string;
    numbered: string;
    syllables: string[];
    valid: boolean;
};
function stripMarks(value: string) {
    let tone = 5;
    let base = '';
    for (const c of value.toLowerCase().normalize('NFC')) {
        let found = false;
        for (const [v, accents] of Object.entries(marks)) {
            const index = accents.indexOf(c);
            if (index >= 0) {
                base += v;
                tone = index + 1;
                found = true;
                break;
            }
        }
        if (!found)
            base += c;
    }
    return { base, tone };
}
export function markSyllable(base: string, tone: number) {
    if (tone === 0 || tone === 5)
        return base;
    let index = base.indexOf('a');
    if (index < 0)
        index = base.indexOf('e');
    if (index < 0 && base.includes('ou'))
        index = base.indexOf('o');
    if (index < 0)
        for (let i = base.length - 1; i >= 0; i--)
            if (marks[base[i]]) {
                index = i;
                break;
            }
    if (index < 0)
        return base;
    return base.slice(0, index) + marks[base[index]][tone - 1] + base.slice(index + 1);
}
function segments(token: string, count?: number): string[] | undefined {
    const memo = new Map<string, string[] | undefined>();
    function visit(rest: string, remaining?: number): string[] | undefined {
        if (!rest)
            return remaining === undefined || remaining === 0 ? [] : undefined;
        if (remaining === 0)
            return undefined;
        const key = rest + ':' + remaining;
        if (memo.has(key))
            return memo.get(key);
        for (let n = Math.min(6, rest.length); n >= 1; n--) {
            const part = rest.slice(0, n);
            const { base } = stripMarks(part);
            if (!syllables.has(base))
                continue;
            // A syllable can contain only one tone-bearing vowel.
            if ([...part].filter(c => Object.values(marks).some(v => v.includes(c))).length > 1)
                continue;
            const tail = visit(rest.slice(n), remaining === undefined ? undefined : remaining - 1);
            if (tail) {
                const result = [part, ...tail];
                memo.set(key, result);
                return result;
            }
        }
        memo.set(key, undefined);
        return undefined;
    }
    return visit(token, count);
}
export function normalizePinyin(input: string, characterCount?: number): PinyinResult {
    const cleaned = input.trim().toLowerCase().normalize('NFC').replace(/u:/g, 'ü').replace(/v/g, 'ü');
    const tokenPattern = /[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+[0-5]?/g;
    const tokens = cleaned.match(tokenPattern) ?? [];
    let valid = tokens.length > 0 && !cleaned.replace(tokenPattern, '').replace(/[\s'’·,，.!?;:()-]/g, '').length;
    const pieces: string[] = [];
    for (const token of tokens) {
        if (/[0-5]$/.test(token))
            pieces.push(token);
        else {
            const split = segments(token, syllables.has(stripMarks(token).base) ? undefined : tokens.length === 1 ? characterCount : undefined);
            if (!split) {
                valid = false;
                pieces.push(token);
            }
            else
                pieces.push(...split);
        }
    }
    const numbered: string[] = [];
    const marked: string[] = [];
    for (const piece of pieces) {
        const explicit = piece.match(/([0-5])$/);
        const stripped = stripMarks(piece.replace(/[0-5]$/, ''));
        const tone = explicit ? Number(explicit[1]) || 5 : stripped.tone;
        if (!syllables.has(stripped.base))
            valid = false;
        numbered.push(stripped.base + tone);
        marked.push(markSyllable(stripped.base, tone));
    }
    return { marked: marked.join(' '), numbered: numbered.join(' '), syllables: marked, valid };
}
export function alignCharacters(traditional: string, pinyin: string) {
    const characters = [...traditional].filter(c => /\p{Script=Han}/u.test(c));
    const result = normalizePinyin(pinyin, characters.length);
    return { alignment: characters.map((character, index) => ({ character, pinyin: result.syllables[index] ?? '' })), alignmentReview: !result.valid || characters.length !== result.syllables.length };
}
export function plainPinyin(input: string) { return stripMarks(input.replace(/u:/g, 'ü').replace(/v/g, 'ü')).base.replace(/[0-5\s'’]/g, '').replace(/ü/g, 'u'); }
