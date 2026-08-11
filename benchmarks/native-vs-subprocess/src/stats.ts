export interface SampleSummary {
	p50: number;
	p95: number;
	mad: number;
}

export interface PairedSummary {
	meanDelta: number;
	ci95: [number, number];
}

function percentile(sorted: readonly number[], probability: number): number {
	return sorted[Math.max(0, Math.ceil(sorted.length * probability) - 1)] ?? 0;
}

function median(values: readonly number[]): number {
	return percentile(
		[...values].sort((a, b) => a - b),
		0.5,
	);
}

export function summarizeSamples(values: readonly number[]): SampleSummary {
	if (values.length === 0) throw new Error("cannot summarize empty samples");
	const sorted = [...values].sort((a, b) => a - b);
	const center = median(sorted);
	return {
		p50: percentile(sorted, 0.5),
		p95: percentile(sorted, 0.95),
		mad: median(sorted.map((value) => Math.abs(value - center))),
	};
}

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
}

export function pairedSummary(
	nativeSamples: readonly number[],
	subprocessSamples: readonly number[],
	resamples = 10_000,
	seed = 1213,
): PairedSummary {
	if (
		nativeSamples.length === 0 ||
		nativeSamples.length !== subprocessSamples.length
	) {
		throw new Error("paired samples must have equal nonzero lengths");
	}
	const deltas = nativeSamples.map((value, index) => {
		const subprocessSample = subprocessSamples[index];
		if (subprocessSample === undefined) {
			throw new Error("paired samples changed during summary");
		}
		return value - subprocessSample;
	});
	const meanDelta =
		deltas.reduce((total, value) => total + value, 0) / deltas.length;
	const random = seededRandom(seed);
	const means: number[] = [];
	for (let sample = 0; sample < resamples; sample += 1) {
		let total = 0;
		for (let index = 0; index < deltas.length; index += 1) {
			const delta = deltas[Math.floor(random() * deltas.length)];
			if (delta === undefined)
				throw new Error("paired delta disappeared during resampling");
			total += delta;
		}
		means.push(total / deltas.length);
	}
	means.sort((a, b) => a - b);
	return {
		meanDelta,
		ci95: [percentile(means, 0.025), percentile(means, 0.975)],
	};
}
