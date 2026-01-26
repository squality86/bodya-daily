"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { encodePacked } from "viem";
import { minikitConfig } from "../minikit.config";
import styles from "./page.module.css";

const ROUND_SECONDS = 30;
const MAX_SCORE = 600;
const GAME_ID = BigInt(1);
const DAY_MS = 24 * 60 * 60 * 1000;

const leaderboardAbi = [
  {
    type: "function",
    name: "submitScore",
    stateMutability: "nonpayable",
    inputs: [
      { name: "score", type: "uint256" },
      { name: "gameId", type: "uint256" },
      { name: "dayId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "ScoreSubmitted",
    inputs: [
      { name: "player", type: "address", indexed: true },
      { name: "score", type: "uint256", indexed: false },
      { name: "gameId", type: "uint256", indexed: true },
      { name: "dayId", type: "uint256", indexed: true },
    ],
    anonymous: false,
  },
] as const;

type GameStatus = "idle" | "playing" | "finished";
type LeaderboardEntry = { player: string; score: number };

const leaderboardAddress = (() => {
  const value = process.env.NEXT_PUBLIC_LEADERBOARD_CONTRACT;
  if (!value || !value.startsWith("0x")) {
    return undefined;
  }
  return value as `0x${string}`;
})();

const getDayId = (timestamp = Date.now()) => Math.floor(timestamp / DAY_MS);

const shortAddress = (value?: string) => {
  if (!value) return "Ты";
  if (!value.startsWith("0x")) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
};

const clampScore = (value: number) => Math.min(Math.max(value, 0), MAX_SCORE);

export default function Home() {
  const { isFrameReady, setFrameReady, context } = useMiniKit();
  const { address, isConnected } = useAccount();
  const {
    writeContract,
    data: contractHash,
    error: writeError,
    isPending: isContractPending,
  } = useWriteContract();
  const {
    sendTransaction,
    data: fallbackHash,
    error: sendError,
    isPending: isSendPending,
  } = useSendTransaction();
  const activeHash = contractHash ?? fallbackHash;
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } =
    useWaitForTransactionReceipt({
      hash: activeHash,
      query: { enabled: Boolean(activeHash) },
    });

  const [status, setStatus] = useState<GameStatus>("idle");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [roundStart, setRoundStart] = useState<number | null>(null);
  const [roundDayId, setRoundDayId] = useState(getDayId());
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [tapPulse, setTapPulse] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentDayId, setCurrentDayId] = useState(getDayId());

  const audioRef = useRef<AudioContext | null>(null);
  const tapAudioRef = useRef<HTMLAudioElement | null>(null);
  const tapTimeoutRef = useRef<number | null>(null);
  const lastCountdownRef = useRef<number | null>(null);
  const recordedRoundRef = useRef<number | null>(null);

  const isHurry = status === "playing" && timeLeft <= 5;

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  useEffect(() => {
    if (status !== "playing" || !roundStart) return;
    const deadline = roundStart + ROUND_SECONDS * 1000;

    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      const nextSeconds = Math.max(0, Math.ceil(remaining / 1000));
      setTimeLeft((prev) => (prev !== nextSeconds ? nextSeconds : prev));
      if (remaining <= 0) {
        setStatus("finished");
      }
    };

    tick();
    const interval = window.setInterval(tick, 120);
    return () => window.clearInterval(interval);
  }, [status, roundStart]);

  useEffect(() => {
    if (status === "finished") {
      setTimeLeft(0);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "playing" || timeLeft > 5 || timeLeft <= 0) return;
    if (lastCountdownRef.current === timeLeft) return;
    lastCountdownRef.current = timeLeft;
    playSound("countdown");
  }, [timeLeft, status]);

  useEffect(() => {
    if (!isConfirmed) return;
    setToast("Результат сохранен on-chain");
    playSound("success");
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [isConfirmed]);

  useEffect(() => {
    if (writeError || confirmError || sendError) {
      setError("Не удалось отправить транзакцию. Попробуйте снова.");
      setIsSubmitted(false);
    }
  }, [writeError, confirmError, sendError]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentDayId(getDayId());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const audio = new Audio("/meow.wav");
    audio.preload = "auto";
    tapAudioRef.current = audio;
  }, []);

  const playSound = (kind: "tap" | "countdown" | "success") => {
    if (kind === "tap" && tapAudioRef.current) {
      const audio = tapAudioRef.current;
      audio.currentTime = 0;
      audio.play().catch(() => undefined);
      return;
    }
    try {
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      const duration = kind === "success" ? 0.4 : 0.18;

      if (kind === "tap") {
        oscillator.frequency.setValueAtTime(520, now);
      } else if (kind === "countdown") {
        oscillator.frequency.setValueAtTime(760, now);
      } else {
        oscillator.frequency.setValueAtTime(440, now);
        oscillator.frequency.exponentialRampToValueAtTime(880, now + duration);
      }

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {
      // ignore audio errors
    }
  };

  const updateLocalLeaderboard = useCallback((player: string, playerScore: number) => {
    setLeaderboard((prev) => {
      const next = new Map<string, number>();
      prev.forEach((entry) => next.set(entry.player, entry.score));
      const currentBest = next.get(player) ?? 0;
      if (playerScore > currentBest) {
        next.set(player, playerScore);
      }
      return [...next.entries()]
        .map(([playerKey, scoreValue]) => ({ player: playerKey, score: scoreValue }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    });
  }, []);

  const startRound = () => {
    setError("");
    setToast("");
    setScore(0);
    setStatus("playing");
    setTimeLeft(ROUND_SECONDS);
    setRoundStart(Date.now());
    setRoundDayId(getDayId());
    setIsSubmitted(false);
    lastCountdownRef.current = null;
  };

  const handleTap = () => {
    if (status !== "playing") return;
    setScore((prev) => clampScore(prev + 1));
    setTapPulse(true);
    playSound("tap");
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
    if (tapTimeoutRef.current) {
      window.clearTimeout(tapTimeoutRef.current);
    }
    tapTimeoutRef.current = window.setTimeout(() => setTapPulse(false), 90);
  };

  const submitScore = useCallback(() => {
    if (status !== "finished") return;
    if (isSubmitted) return;
    if (!isConnected || !address) {
      setError("Подключи wallet в Base App.");
      return;
    }
    if (score <= 0 || score > MAX_SCORE) {
      setError("Некорректный результат раунда.");
      return;
    }
    setError("");
    setIsSubmitted(true);
    try {
      if (leaderboardAddress) {
        writeContract({
          address: leaderboardAddress,
          abi: leaderboardAbi,
          functionName: "submitScore",
          args: [BigInt(score), GAME_ID, BigInt(roundDayId)],
        });
      } else {
        const data = encodePacked(
          ["string", "uint256", "uint256", "uint256"],
          ["BodyaDaily", BigInt(score), GAME_ID, BigInt(roundDayId)]
        );
        sendTransaction({
          to: address,
          value: BigInt(0),
          data,
        });
      }
    } catch {
      setIsSubmitted(false);
      setError("Не удалось инициировать транзакцию.");
    }
  }, [
    status,
    isSubmitted,
    isConnected,
    address,
    score,
    roundDayId,
    writeContract,
    sendTransaction,
    leaderboardAddress,
  ]);

  useEffect(() => {
    if (status !== "finished") return;
    if (roundStart && recordedRoundRef.current !== roundStart) {
      recordedRoundRef.current = roundStart;
      updateLocalLeaderboard(address ?? "Ты", score);
    }
    submitScore();
  }, [status, submitScore, roundStart, score, address, updateLocalLeaderboard]);

  const submitting = isContractPending || isSendPending || isConfirming;

  return (
    <div className={styles.container}>
      <div className={styles.topBanner}>Тапаем на АнтиФомо, а там, как Бог даст!</div>
      <header className={styles.header}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>ТАЙМЕР</span>
          <span className={`${styles.metricValue} ${isHurry ? styles.hurry : ""}`}>
            {timeLeft}s
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>КОШЕК</span>
          <span className={styles.metricValue}>{score}</span>
        </div>
      </header>

      <section className={styles.center}>
        <div className={`${styles.catFrame} ${isHurry ? styles.hurryFrame : ""}`}>
          <button
            type="button"
            className={`${styles.catButton} ${tapPulse ? styles.tapPulse : ""}`}
            onClick={handleTap}
            disabled={status !== "playing"}
            aria-label="Tap the cat"
          />
        </div>
        <p className={styles.helperText}>
          {status === "playing"
            ? "Тапай быстро! Каждое касание = +1 кот."
            : "Запусти раунд и набери максимум за 30 секунд."}
        </p>
      </section>

      <section className={styles.actions}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={startRound}
          disabled={status === "playing"}
        >
          {status === "playing"
            ? "Идёт раунд..."
            : status === "finished"
              ? "🐱 Сыграть снова"
              : "🐱 Старт"}
        </button>
        <div className={styles.statusRow}>
          {submitting && <span className={styles.statusBadge}>Фиксация on-chain...</span>}
          {isConfirmed && <span className={styles.statusBadgeSuccess}>Сохранено ✓</span>}
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </section>

      <section className={styles.leaderboard}>
        <div className={styles.leaderboardHeader}>
          <h2>Лидерборд дня</h2>
          <span>Day #{currentDayId}</span>
        </div>
        {leaderboard.length === 0 && (
          <p className={styles.helperText}>Пока нет результатов. Стань первым!</p>
        )}
        <ul className={styles.leaderboardList}>
          {leaderboard.map((entry, index) => (
            <li key={entry.player} className={styles.leaderboardItem}>
              <span className={styles.rank}>#{index + 1}</span>
              <span className={styles.player}>{shortAddress(entry.player)}</span>
              <span className={styles.score}>{entry.score} 🐱</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className={styles.footer}>
        <span>{minikitConfig.miniapp.name}</span>
        <span>{context?.user?.displayName ? `Привет, ${context.user.displayName}` : "Base App"}</span>
        <span>{address ? shortAddress(address) : "Wallet не подключен"}</span>
      </footer>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
