// Credit tables in the minor documents state credits three ways: a plain
// number ("3", "04"), an L:T:P split ("3:1:0", "2-0-2"), or both at once
// ("4 (3:1:0)").
//
// Trust the stated number whenever there is one. Adding L, T and P agrees
// with it almost everywhere, but not always — Design lists "3 (3:1:1)",
// which is 3 credits, not 5.
export function creditsOf(values: string[]): number {
	for (const raw of values) {
		const v = raw.trim();
		const plain = v.match(/^(\d+)(?![\d:\-])/);
		if (plain) return Number(plain[1]);
		const ltp = v.match(/^(\d+)\s*[:\-]\s*(\d+)\s*[:\-]\s*(\d+)$/);
		if (ltp) return Number(ltp[1]) + Number(ltp[2]) + Number(ltp[3]);
	}
	return 0;
}
