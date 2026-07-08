"use client";

import { useEffect, useState } from "react";
import SatisfactionChart from "@/components/SatisfactionChart";
import ClientTable from "@/components/ClientTable";
import { RefreshCcw, Search, Filter, X, ExternalLink, AlertTriangle, CalendarRange, Users, PhoneCall, Eraser, Phone, CalendarCheck, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";

const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1JhnWKiaCp-1sLx04vn4HKMiNMvSxgFu3rqvrBHUcJAU/edit?gid=0#gid=0";
const ERRORS_SHEET_URL = "https://docs.google.com/spreadsheets/d/1JhnWKiaCp-1sLx04vn4HKMiNMvSxgFu3rqvrBHUcJAU/edit?gid=1068236709#gid=1068236709";
const VOICEMAIL_SHEET_URL = "https://docs.google.com/spreadsheets/d/1QbW0-S73PVoEW8lIO_JyLFfdJuP9Z6m-pCujXpPqUDo/edit?gid=0#gid=0";
const SCORE_KEYS = ["Conexão/Rapport", "Apres. Autoridade", "Entendimento Dores", "Apres. Solução", "Agendamento"];
const FALLBACK_TOP_ERRORS = [
    { erro: "Identificação incorreta do prospect", quantidade: 47, categoria: "Geral" },
    { erro: "Não correção do erro de nome", quantidade: 47, categoria: "Geral" },
    { erro: "Falta de resiliência e desistência precoce", quantidade: 47, categoria: "Geral" },
    { erro: "Falta de preparo", quantidade: 47, categoria: "Geral" },
];
const FALLBACK_SDR_ERRORS = [
    { nome: "(Top 3 Erros)", erros: [], total_erros_sdr: 0 },
    {
        nome: "Bruno Borges",
        erros: [
            { erro: "Identificação incorreta do prospect", quantidade: 3 },
            { erro: "Não correção do erro de nome", quantidade: 3 },
            { erro: "Falta de resiliência e desistência precoce", quantidade: 3 },
        ],
        total_erros_sdr: 9,
    },
    {
        nome: "Gabriella",
        erros: [
            { erro: "Identificação incorreta do prospect", quantidade: 8 },
            { erro: "Não correção do erro de nome", quantidade: 8 },
            { erro: "Falta de resiliência e desistência precoce", quantidade: 8 },
        ],
        total_erros_sdr: 24,
    },
    {
        nome: "Ligiane",
        erros: [
            { erro: "Identificação incorreta do prospect", quantidade: 8 },
            { erro: "Não correção do erro de nome", quantidade: 8 },
            { erro: "Falta de resiliência e desistência precoce", quantidade: 8 },
        ],
        total_erros_sdr: 24,
    },
    {
        nome: "Revik Vinicius",
        erros: [
            { erro: "Identificação incorreta do prospect", quantidade: 20 },
            { erro: "Não correção do erro de nome", quantidade: 20 },
            { erro: "Falta de resiliência e desistência precoce", quantidade: 20 },
        ],
        total_erros_sdr: 60,
    },
    {
        nome: "Wagner Ramon",
        erros: [
            { erro: "Identificação incorreta do prospect", quantidade: 7 },
            { erro: "Não correção do erro de nome", quantidade: 7 },
            { erro: "Falta de resiliência e desistência precoce", quantidade: 7 },
        ],
        total_erros_sdr: 21,
    },
];
const FALLBACK_INSIGHT = "Com base nos feedbacks, o time de Inside Sales enfrenta um desafio sistêmico que engloba tanto a falta de processo (preparação) quanto a falta de técnica na abordagem inicial. Os erros de identificação incorreta do prospect e falta de preparo indicam uma falha generalizada na fase pré-ligação, sugerindo a necessidade de otimização e padronização no processo de pesquisa e validação de dados dos leads. Paralelamente, a não correção do erro de nome e a falta de resiliência e desistência precoce apontam para lacunas em habilidades cruciais de técnica de vendas, como escuta ativa, construção de rapport e o manejo eficaz de objeções iniciais para manter o prospect engajado. É imperativo abordar ambos os pilares com treinamentos específicos e a implementação de checklists ou roteiros pré-ligação para garantir uma abordagem mais profissional, personalizada e persistente desde o primeiro contato, impactando diretamente nas taxas de conversão de prospecção.";
const FALLBACK_ERRORS_DATE = "2026-03-11";

// Helper to parse JSON fields from sheet cells (handles CSV-exported/escaped strings)
function parseJsonField(value) {
    if (!value) return null;
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return null;

    let raw = value.trim();

    // Google Sheets CSV sometimes double-quotes embedded quotes: ""key"" -> "key"
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        raw = raw.slice(1, -1);
    }
    raw = raw.replace(/""/g, '"');

    if (!raw.startsWith('[') && !raw.startsWith('{')) return null;

    const attempts = [
        raw,
        raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
        raw
            .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'"),
        raw
            .replace(/&quot;/g, '"')
            .replace(/&#34;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&'),
    ];

    for (const candidate of attempts) {
        try {
            const parsed = JSON.parse(candidate);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            // keep trying next normalization strategy
        }
    }

    return null;
}

function cleanRichText(value) {
    return String(value || "")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function parseListOrTextField(value) {
    const parsed = parseJsonField(value);
    if (parsed && parsed.length > 0) {
        return parsed
            .map((item) => cleanRichText(typeof item === "string" ? item : JSON.stringify(item)))
            .filter(Boolean);
    }

    const raw = cleanRichText(value);
    if (!raw) return [];
    return [raw];
}

function decodeJsonStringValue(value) {
    if (value === null || value === undefined) return "";
    const raw = String(value);
    try {
        return JSON.parse(`"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    } catch {
        return raw;
    }
}

function parseChecklistField(value) {
    const parsed = parseJsonField(value);
    if (parsed && parsed.length > 0) return parsed;

    const raw = String(value || "")
        .replace(/""/g, '"')
        .replace(/\\"/g, '"');

    const itemRegex = /"item"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"concluido"\s*:\s*(true|false)\s*,\s*"status"\s*:\s*"((?:\\.|[^"\\])*)"/g;
    const categoryRegex = /"categoria"\s*:\s*"((?:\\.|[^"\\])*)"/g;

    const categories = [];
    for (const match of raw.matchAll(categoryRegex)) {
        categories.push(decodeJsonStringValue(match[1]));
    }

    const items = [];
    for (const match of raw.matchAll(itemRegex)) {
        items.push({
            item: decodeJsonStringValue(match[1]),
            concluido: match[2] === "true",
            status: decodeJsonStringValue(match[3]),
        });
    }

    if (items.length === 0) return null;

    return [{
        categoria: categories[0] || "Melhorias Identificadas",
        itens: items,
    }];
}

function formatChecklistItemText(value) {
    return String(value || "")
        .replace(/^\s*[*\-]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
}

function isChecklistSectionTitle(text) {
    return /^\d+\.\s+/.test(text);
}

function normalizeText(value) {
    return String(value || "")
    .replace(/[_-]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function getSdrLabel(value) {
    const normalized = normalizeText(value);
    return normalized || "Não informado";
}

function getSdrKey(value) {
    return getSdrLabel(value).toLocaleLowerCase("pt-BR");
}

function buildDateKey(year, month, day) {
    const yyyy = String(year);
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function toLocalDateKey(date) {
    return buildDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function parseRowDateKey(value) {
    if (!value || typeof value !== "string") return null;
    const raw = value.trim();

    const localMatch = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (localMatch) {
        const day = Number(localMatch[1]);
        const month = Number(localMatch[2]);
        const year = Number(localMatch[3]);
        return buildDateKey(year, month, day);
    }

    const dateTimeMatch = raw.match(/^\[DateTime:\s*(.+)\]$/);
    const normalizedRaw = dateTimeMatch && dateTimeMatch[1] ? dateTimeMatch[1].trim() : raw;

    const isoDatePrefixMatch = normalizedRaw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s].*)/);
    if (isoDatePrefixMatch) {
        const year = Number(isoDatePrefixMatch[1]);
        const month = Number(isoDatePrefixMatch[2]);
        const day = Number(isoDatePrefixMatch[3]);
        return buildDateKey(year, month, day);
    }

    const parsed = new Date(normalizedRaw);
    if (!Number.isNaN(parsed.getTime())) {
        return toLocalDateKey(parsed);
    }

    return null;
}

function parseRowDate(value) {
    if (!value || typeof value !== "string") return null;
    const raw = value.trim();

    const isoDateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateOnlyMatch) {
        const year = Number(isoDateOnlyMatch[1]);
        const month = Number(isoDateOnlyMatch[2]) - 1;
        const day = Number(isoDateOnlyMatch[3]);
        return new Date(year, month, day).getTime();
    }

    // Supports values like [DateTime: 2026-03-11T10:53:12.118-03:00]
    const dateTimeMatch = raw.match(/^\[DateTime:\s*(.+)\]$/);
    if (dateTimeMatch && dateTimeMatch[1]) {
        const parsed = new Date(dateTimeMatch[1]);
        if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
    }

    // Supports dd/mm/yyyy hh:mm and dd-mm-yyyy hh:mm
    const dateTimeLocalMatch = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dateTimeLocalMatch) {
        const day = Number(dateTimeLocalMatch[1]);
        const month = Number(dateTimeLocalMatch[2]) - 1;
        const year = Number(dateTimeLocalMatch[3]);
        const hour = Number(dateTimeLocalMatch[4] || 0);
        const minute = Number(dateTimeLocalMatch[5] || 0);
        const second = Number(dateTimeLocalMatch[6] || 0);
        return new Date(year, month, day, hour, minute, second).getTime();
    }

    // Supports dd-mm-yyyy and dd/mm/yyyy from sheet exports
    const match = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (match) {
        const day = Number(match[1]);
        const month = Number(match[2]) - 1;
        const year = Number(match[3]);
        return new Date(year, month, day).getTime();
    }

    // Supports direct ISO values if they come without wrapper
    // Fallback parsing (but beware of MM/DD/YYYY misinterpretations by JS new Date)
    const isoParsed = new Date(raw);
    if (!Number.isNaN(isoParsed.getTime())) return isoParsed.getTime();

    return null;
}

function formatDateTime(value) {
    if (!value) return "—";
    const raw = String(value).trim();

    const match = raw.match(/^\[DateTime:\s*(.+)\]$/);
    if (match && match[1]) {
        const parsed = new Date(match[1]);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
        }
    }

    const localMatch = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (localMatch) {
        const day = Number(localMatch[1]);
        const month = Number(localMatch[2]) - 1;
        const year = Number(localMatch[3]);
        const hour = Number(localMatch[4] || 0);
        const minute = Number(localMatch[5] || 0);
        const second = Number(localMatch[6] || 0);
        const parsed = new Date(year, month, day, hour, minute, second);
        return parsed.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }

    return raw;
}

function isMeetingScheduled(value) {
    const meeting = (value || "").toUpperCase();
    return meeting === "TRUE" || meeting === "SIM" || meeting === "YES";
}

function normalizeForComparison(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
        .toLowerCase()
    .replace(/\s+/g, " ")
        .trim();
}

function isErrorLikeValue(value) {
    const normalized = normalizeForComparison(value);
    if (!normalized) return false;
    if (normalized.includes("sem erro") || normalized.includes("sem falha")) return false;

    const errorKeywords = [
        "erro",
        "falha",
        "caixa postal",
        "nao atendeu",
        "não atendeu",
        "sem sucesso",
        "ocupado",
        "invalido",
        "inválido",
        "cancelado",
    ];

    return errorKeywords.some((keyword) => normalized.includes(normalizeForComparison(keyword)));
}

function computeVoicemailStats(rows) {
    let totalAttempts = 0;
    let errorAttempts = 0;
    let rowsWithError = 0;

    rows.forEach((row) => {
        const entries = Object.entries(row || {});

        const statusEntry = entries.find(([key]) => {
            const keyNorm = normalizeForComparison(key);
            return (
                keyNorm.includes("status") ||
                keyNorm.includes("resultado") ||
                keyNorm.includes("motivo") ||
                keyNorm.includes("erro")
            );
        });
        const durationEntry = entries.find(([key]) => {
            const keyNorm = normalizeForComparison(key);
            return (
                keyNorm.includes("duracao") ||
                keyNorm.includes("duração") ||
                keyNorm.includes("duration") ||
                keyNorm.includes("tempo")
            );
        });

        const statusValue = statusEntry ? statusEntry[1] : "";
        const durationValue = durationEntry ? durationEntry[1] : "";

        const hasAttempt = Boolean(String(statusValue || "").trim() || String(durationValue || "").trim());
        const hasError = isErrorLikeValue(statusValue);

        const rowAttemptCount = hasAttempt ? 1 : 0;
        const rowErrorCount = hasError ? 1 : 0;

        totalAttempts += rowAttemptCount;
        errorAttempts += rowErrorCount;
        if (rowErrorCount > 0) rowsWithError += 1;
    });

    return {
        totalRows: rows.length,
        totalAttempts,
        errorAttempts,
        rowsWithError,
    };
}

export default function Home() {
    const [data, setData] = useState([]);
    const [errorsData, setErrorsData] = useState([]);
    const [errorsLoading, setErrorsLoading] = useState(true);
    const [errorsFetchError, setErrorsFetchError] = useState(null);
    const [errorsLastUpdated, setErrorsLastUpdated] = useState(null);
    const [voicemailRows, setVoicemailRows] = useState([]);
    const [voicemailLoading, setVoicemailLoading] = useState(true);
    const [voicemailAccessError, setVoicemailAccessError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [voicemailLastUpdated, setVoicemailLastUpdated] = useState(null);
    const [sheetUrl, setSheetUrl] = useState(DEFAULT_SHEET_URL);
    const [sheetInputValue, setSheetInputValue] = useState(DEFAULT_SHEET_URL);
    const [sheetModalOpen, setSheetModalOpen] = useState(false);
    const [rankingModalOpen, setRankingModalOpen] = useState(false);
    const [errorsModalOpen, setErrorsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("dashboard");

    // Filter State
    const [searchTerm, setSearchTerm] = useState("");
    const [sdrFilter, setSdrFilter] = useState("all");
    const [meetingFilter, setMeetingFilter] = useState("all");
    const [startDateFilter, setStartDateFilter] = useState("");
    const [endDateFilter, setEndDateFilter] = useState("");
    const [datePreset, setDatePreset] = useState("none");
    const [filtersOpen, setFiltersOpen] = useState(false);
    // Principais Erros day filter
    const [mainErrorsDay, setMainErrorsDay] = useState("");

    const hasActiveFilters =
        searchTerm.trim() !== "" ||
        sdrFilter !== "all" ||
        meetingFilter !== "all" ||
        startDateFilter !== "" ||
        endDateFilter !== "";

    const clearFilters = () => {
        setSearchTerm("");
        setSdrFilter("all");
        setMeetingFilter("all");
        setStartDateFilter("");
        setEndDateFilter("");
        setDatePreset("none");
    };

    function formatDateForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function getCurrentWeekStart(referenceDate) {
        const start = new Date(referenceDate);
        const day = start.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        start.setDate(start.getDate() + diff);
        start.setHours(0, 0, 0, 0);
        return start;
    }

    function applyDatePreset(preset) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (preset === "today") {
            const formatted = formatDateForInput(today);
            setStartDateFilter(formatted);
            setEndDateFilter(formatted);
            setDatePreset("today");
            return;
        }

        if (preset === "yesterday") {
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const formatted = formatDateForInput(yesterday);
            setStartDateFilter(formatted);
            setEndDateFilter(formatted);
            setDatePreset("yesterday");
            return;
        }

        if (preset === "this-week") {
            const weekStart = getCurrentWeekStart(today);
            setStartDateFilter(formatDateForInput(weekStart));
            setEndDateFilter(formatDateForInput(today));
            setDatePreset("this-week");
            return;
        }

        setDatePreset("none");
    }

    function handleStartDateChange(value) {
        setStartDateFilter(value);
        setDatePreset("none");
    }

    function handleEndDateChange(value) {
        setEndDateFilter(value);
        setDatePreset("none");
    }

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [modalRow, setModalRow] = useState(null);

    const openModal = (row) => {
        setModalRow(row);
        setModalOpen(true);
    };

    const fetchData = async (url, bypassCache = false) => {
        const targetUrl = url || sheetUrl;
        if (!targetUrl) return;
        setLoading(true);
        try {
            const cacheParam = bypassCache ? `&bypassCache=true&t=${Date.now()}` : '';
            const res = await fetch(`/api/sheets?url=${encodeURIComponent(targetUrl)}${cacheParam}`);
            const jsonData = await res.json();
            if (jsonData.error) {
                console.error("API Error:", jsonData.error);
            } else {
                setData(Array.isArray(jsonData.data) ? jsonData.data : []);
                setLastUpdated(new Date());
            }
        } catch (error) {
            console.error("Failed to fetch data", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchErrorsData = async (bypassCache = false) => {
        setErrorsLoading(true);
        setErrorsFetchError(null);
        try {
            const cacheParam = bypassCache ? `&bypassCache=true&t=${Date.now()}` : '';
            const res = await fetch(`/api/sheets?url=${encodeURIComponent(ERRORS_SHEET_URL)}${cacheParam}`);
            const jsonData = await res.json();
            if (jsonData.error) {
                console.error("Errors sheet API Error:", jsonData.error);
                setErrorsFetchError(jsonData.error);
            } else {
                setErrorsData(Array.isArray(jsonData.data) ? jsonData.data : []);
                setErrorsLastUpdated(new Date());
            }
        } catch (error) {
            console.error("Failed to fetch errors data", error);
            setErrorsFetchError(error.message);
        } finally {
            setErrorsLoading(false);
        }
    };

    const fetchVoicemailCount = async (bypassCache = false) => {
        setVoicemailLoading(true);
        try {
            const cacheParam = bypassCache ? `&bypassCache=true&t=${Date.now()}` : '';
            const res = await fetch(`/api/sheets?url=${encodeURIComponent(VOICEMAIL_SHEET_URL)}${cacheParam}`);
            const jsonData = await res.json();
            if (res.status === 401 || res.status === 403) {
                setVoicemailAccessError("A planilha de caixa postal exige acesso. Publique como 'Qualquer pessoa com o link' para contabilizar automaticamente.");
                setVoicemailRows([]);
                return "unauthorized";
            }

            if (!res.ok || jsonData.error) {
                console.error("Voicemail sheet API Error:", jsonData.error);
                setVoicemailAccessError("Não foi possível acessar a planilha de caixa postal no momento.");
                setVoicemailRows([]);
            } else {
                const rows = Array.isArray(jsonData.data) ? jsonData.data : [];
                setVoicemailRows(rows);
                setVoicemailAccessError(null);
                setVoicemailLastUpdated(new Date());
            }
        } catch (error) {
            console.error("Failed to fetch voicemail count", error);
            setVoicemailAccessError("Falha de conexão ao buscar a planilha de caixa postal.");
            setVoicemailRows([]);
        } finally {
            setVoicemailLoading(false);
        }

        return "ok";
    };

    const handleLoadSheet = () => {
        if (!sheetInputValue.trim()) return;
        setSheetUrl(sheetInputValue.trim());
        fetchData(sheetInputValue.trim());
        setSheetModalOpen(false);
    };

    const REVALIDATION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

    // Main data loading
    useEffect(() => {
        if (!sheetUrl) return;
        fetchData(sheetUrl);
    }, [sheetUrl]);

    // Errors sheet loading
    useEffect(() => {
        fetchErrorsData();
    }, []);

    // Voicemail loading
    useEffect(() => {
        fetchVoicemailCount();
    }, []);

    // Tab focus revalidation: fetch if visibility becomes visible and last fetch was > 5 minutes ago
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                const now = new Date();
                
                // Revalidate main data
                if (sheetUrl && (!lastUpdated || now - lastUpdated > REVALIDATION_COOLDOWN)) {
                    fetchData(sheetUrl);
                }
                
                // Revalidate errors data
                if (!errorsLastUpdated || now - errorsLastUpdated > REVALIDATION_COOLDOWN) {
                    fetchErrorsData();
                }
                
                // Revalidate voicemail data
                if (!voicemailLastUpdated || now - voicemailLastUpdated > REVALIDATION_COOLDOWN) {
                    fetchVoicemailCount();
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [sheetUrl, lastUpdated, errorsLastUpdated, voicemailLastUpdated]);

    // Derived State: Filtered Data
    const filteredData = data.filter(item => {
        const prospect = (item["Prospect / Empressa"] || "").toLowerCase();
        const sdrKey = getSdrKey(item["SDR / Pré-venda"]);
        const isScheduled = isMeetingScheduled(item["Reunião Marcada?"]);
        const rowDateKey = parseRowDateKey(item["Data"]);

        const matchesSearch = prospect.includes(searchTerm.toLowerCase());
        const matchesSdr = sdrFilter === "all" || sdrKey === sdrFilter;
        const matchesMeeting =
            meetingFilter === "all" ||
            (meetingFilter === "yes" && isScheduled) ||
            (meetingFilter === "no" && !isScheduled);
        const matchesStartDate = !startDateFilter || (rowDateKey !== null && rowDateKey >= startDateFilter);
        const matchesEndDate = !endDateFilter || (rowDateKey !== null && rowDateKey <= endDateFilter);

        return matchesSearch && matchesSdr && matchesMeeting && matchesStartDate && matchesEndDate;
    }).sort((a, b) => {
        const dateA = parseRowDate(a["Data"]);
        const dateB = parseRowDate(b["Data"]);

        // Most recent first; rows with invalid/missing dates go to the end.
        if (dateA === null && dateB === null) return 0;
        if (dateA === null) return 1;
        if (dateB === null) return -1;
        return dateB - dateA;
    });

    function getRowValueByCandidates(row, candidates) {
        if (!row) return "";
        const entries = Object.entries(row);

        for (const candidate of candidates) {
            const candidateNorm = normalizeForComparison(candidate);
            const exact = entries.find(([key]) => normalizeForComparison(key) === candidateNorm);
            if (exact && String(exact[1] || "").trim()) return String(exact[1]);
        }

        for (const candidate of candidates) {
            const candidateNorm = normalizeForComparison(candidate);
            const partial = entries.find(([key]) => normalizeForComparison(key).includes(candidateNorm));
            if (partial && String(partial[1] || "").trim()) return String(partial[1]);
        }

        return "";
    }

    const filteredVoicemailRows = voicemailRows.filter((row) => {
        const prospectValue = getRowValueByCandidates(row, [
            "Prospect / Empressa",
            "Prospect",
            "Empresa",
            "Cliente",
            "Lead",
            "Nome",
        ]);
        const sdrValue = getRowValueByCandidates(row, [
            "SDR / Pré-venda",
            "SDR",
            "Pré-venda",
            "Pre-venda",
            "Responsável",
        ]);
        const meetingValue = getRowValueByCandidates(row, [
            "Reunião Marcada?",
            "Reuniao Marcada?",
            "Reunião",
            "Status da ligação",
            "Status Ligação",
            "Status Ligacao",
        ]);
        const dateValue = getRowValueByCandidates(row, [
            "Data",
            "Data da Tentativa",
            "Data Tentativa",
            "Data/Hora",
            "Data Hora",
        ]);

        const prospect = prospectValue.toLowerCase();
        const sdrKey = getSdrKey(sdrValue);
        const isScheduled = isMeetingScheduled(meetingValue);
        const rowDateKey = parseRowDateKey(dateValue);

        const matchesSearch = prospect.includes(searchTerm.toLowerCase());
        const matchesSdr = sdrFilter === "all" || sdrKey === sdrFilter;
        const matchesMeeting =
            meetingFilter === "all" ||
            (meetingFilter === "yes" && isScheduled) ||
            (meetingFilter === "no" && !isScheduled);
        const matchesStartDate = !startDateFilter || (rowDateKey !== null && rowDateKey >= startDateFilter);
        const matchesEndDate = !endDateFilter || (rowDateKey !== null && rowDateKey <= endDateFilter);

        return matchesSearch && matchesSdr && matchesMeeting && matchesStartDate && matchesEndDate;
    });

    const voicemailFilteredStats = computeVoicemailStats(filteredVoicemailRows);

    // Unique SDRs for Filter Dropdown
    const sdrs = Object.values(
        data.reduce((acc, item) => {
            const label = getSdrLabel(item["SDR / Pré-venda"]);
            const key = getSdrKey(item["SDR / Pré-venda"]);
            if (!acc[key]) {
                acc[key] = { key, label };
            }
            return acc;
        }, {})
    ).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    const sdrRanking = Object.entries(
        filteredData.reduce((acc, row) => {
            const sdrKey = getSdrKey(row["SDR / Pré-venda"]);
            const sdrLabel = getSdrLabel(row["SDR / Pré-venda"]);
            if (!acc[sdrKey]) acc[sdrKey] = { name: sdrLabel, meetings: 0 };
            if (isMeetingScheduled(row["Reunião Marcada?"])) {
                acc[sdrKey].meetings += 1;
            }
            return acc;
        }, {})
    )
        .map(([, value]) => value)
        .sort((a, b) => b.meetings - a.meetings || a.name.localeCompare(b.name, "pt-BR"));

    const sdrCallsRanking = Object.entries(
        filteredData.reduce((acc, row) => {
            const sdrKey = getSdrKey(row["SDR / Pré-venda"]);
            const sdrLabel = getSdrLabel(row["SDR / Pré-venda"]);
            if (!acc[sdrKey]) acc[sdrKey] = { name: sdrLabel, calls: 0 };
            acc[sdrKey].calls += 1;
            return acc;
        }, {})
    )
        .map(([, value]) => value)
        .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name, "pt-BR"));

    const sdrScoreRanking = Object.values(
        filteredData.reduce((acc, row) => {
            const sdrKey = getSdrKey(row["SDR / Pré-venda"]);
            const sdrLabel = getSdrLabel(row["SDR / Pré-venda"]);
            if (!acc[sdrKey]) {
                acc[sdrKey] = {
                    name: sdrLabel,
                    callScoreSum: 0,
                    scoredCalls: 0,
                };
            }

            const rowScores = SCORE_KEYS
                .map((key) => parseFloat(row[key]))
                .filter((value) => !Number.isNaN(value));

            if (rowScores.length > 0) {
                const rowAverage = rowScores.reduce((sum, value) => sum + value, 0) / rowScores.length;
                acc[sdrKey].callScoreSum += rowAverage;
                acc[sdrKey].scoredCalls += 1;
            }

            return acc;
        }, {})
    )
        .filter((item) => item.scoredCalls > 0)
        .map((item) => ({
            ...item,
            averageScore: item.callScoreSum / item.scoredCalls,
        }))
        .sort((a, b) => b.averageScore - a.averageScore || b.scoredCalls - a.scoredCalls || a.name.localeCompare(b.name, "pt-BR"));

    const recurringCriticalErrors = Object.values(
        filteredData.reduce((acc, row) => {
            const errors = parseJsonField(row["Erros Criticos"]);
            if (!errors || errors.length === 0) return acc;

            const prospectName = row["Prospect / Empressa"] || "Prospect não informado";

            errors.forEach((errorItem) => {
                const label = cleanRichText(errorItem);
                if (!label) return;

                const key = label.toLocaleLowerCase("pt-BR");
                if (!acc[key]) {
                    acc[key] = {
                        key,
                        label,
                        count: 0,
                        prospects: [],
                    };
                }

                acc[key].count += 1;
                if (!acc[key].prospects.includes(prospectName)) {
                    acc[key].prospects.push(prospectName);
                }
            });

            return acc;
        }, {})
    ).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));

    // Flexible column lookup: resilient to typos/spaces/underscores in sheet headers.
    function getErrCol(row, ...candidates) {
        if (!row) return undefined;
        const keys = Object.keys(row);

        for (const candidate of candidates) {
            const norm = normalizeForComparison(candidate);
            const exact = keys.find((k) => normalizeForComparison(k) === norm);
            if (exact !== undefined) return row[exact];
        }

        for (const candidate of candidates) {
            const norm = normalizeForComparison(candidate);
            const partial = keys.find((k) => {
                const keyNorm = normalizeForComparison(k);
                return keyNorm.includes(norm) || norm.includes(keyNorm);
            });
            if (partial !== undefined) return row[partial];
        }

        return undefined;
    }

    function hasMainErrorsPayload(row) {
        return Boolean(
            getErrCol(row, "TOP ERROS", "TOP_ERROS") ||
            getErrCol(row, "ERROS SDRs", "ERROS_SDRS", "ERROS SDRS") ||
            getErrCol(row, "INSIGTH", "INSIGHT", "INSIGHTS") ||
            getErrCol(row, "DATA")
        );
    }

    const errorsRowsWithPayload = errorsData.filter(hasMainErrorsPayload);

    // Filter Principais Erros by selected day
    let mainErrorsRow = null;
    if (mainErrorsDay) {
        mainErrorsRow = errorsRowsWithPayload.find(row => {
            const rowDate = String(getErrCol(row, "DATA") || "").slice(0, 10);
            return rowDate === mainErrorsDay;
        }) || null;
    }
    if (!mainErrorsRow) {
        // fallback to latest
        mainErrorsRow = errorsRowsWithPayload.reduce((latestRow, currentRow) => {
            if (!latestRow) return currentRow;
            const latestDate = parseRowDate(String(getErrCol(latestRow, "DATA") || ""));
            const currentDate = parseRowDate(String(getErrCol(currentRow, "DATA") || ""));
            if (latestDate === null && currentDate === null) return currentRow;
            if (latestDate === null) return currentRow;
            if (currentDate === null) return latestRow;
            return currentDate >= latestDate ? currentRow : latestRow;
        }, null);
    }

    const topErrors = parseJsonField(getErrCol(mainErrorsRow, "TOP ERROS", "TOP_ERROS")) || FALLBACK_TOP_ERRORS;
    const sdrErrors = parseJsonField(getErrCol(mainErrorsRow, "ERROS SDRs", "ERROS_SDRS", "ERROS SDRS")) || FALLBACK_SDR_ERRORS;
    const insightText = String(getErrCol(mainErrorsRow, "INSIGTH", "INSIGHT", "INSIGHTS") || FALLBACK_INSIGHT).trim();
    const errorsDate = String(getErrCol(mainErrorsRow, "DATA") || FALLBACK_ERRORS_DATE).trim();

    function isSdrErrorsInstructionRow(name) {
        const normalized = normalizeForComparison(name);
        if (!normalized) return true;

        return (
            normalized === normalizeForComparison("Top 3 Erros") ||
            normalized.includes("contagem baseada exclusivamente") ||
            normalized.includes("seus dados")
        );
    }

    const sdrErrorsRanking = sdrErrors
        .filter((item) => Number(item?.total_erros_sdr) > 0 && !isSdrErrorsInstructionRow(item?.nome))
        .map((item) => ({
            nome: normalizeText(item.nome),
            total: Number(item.total_erros_sdr) || 0,
            erros: Array.isArray(item.erros) ? item.erros : [],
        }))
        .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));

    const totalCalls = filteredData.length;
    const scheduledCalls = filteredData.filter((row) => isMeetingScheduled(row["Reunião Marcada?"])).length;
    const scheduledPct = totalCalls > 0 ? Math.round((scheduledCalls / totalCalls) * 100) : 0;

    let scoreSum = 0;
    let scoreCount = 0;
    filteredData.forEach((row) => {
        SCORE_KEYS.forEach((key) => {
            const value = parseFloat(row[key]);
            if (!Number.isNaN(value)) {
                scoreSum += value;
                scoreCount += 1;
            }
        });
    });
    const avgScore = scoreCount > 0 ? (scoreSum / scoreCount).toFixed(1) : "—";

    return (
        <main className="min-h-screen p-5 md:p-8 bg-background text-foreground">
            <div className="max-w-7xl mx-auto space-y-8 reveal-rise">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="impact-title text-5xl md:text-6xl text-sky-100 leading-none">
                            Dashboard de Pré-Vendas
                        </h1>
                        <p className="text-muted-foreground mt-2 text-slate-300 text-sm md:text-base">
                            {activeTab === "dashboard"
                                ? `Visão geral — ${filteredData.length} de ${data.length} ligações exibidas`
                                : `Análise consolidada de erros críticos — referência ${errorsDate}`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {activeTab === "dashboard" ? (
                            <>
                                <button
                                    onClick={() => setSheetModalOpen(true)}
                                    className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/35 text-sky-100 border border-blue-300/35 rounded-lg transition-colors text-sm font-semibold glass-panel danger-glow"
                                >
                                    Conectar Planilha
                                </button>
                                <button
                                    onClick={() => fetchData(sheetUrl, true)}
                                    disabled={!sheetUrl || loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-100 border border-cyan-300/35 rounded-lg transition-colors text-sm font-semibold glass-panel disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
                                    Atualizar
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => fetchErrorsData(true)}
                                disabled={errorsLoading}
                                className="flex items-center gap-2 px-4 py-2 bg-red-500/15 hover:bg-red-500/25 text-red-100 border border-red-300/25 rounded-lg transition-colors text-sm font-semibold glass-panel disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <RefreshCcw size={16} className={errorsLoading ? "animate-spin" : ""} />
                                Atualizar
                            </button>
                        )}
                    </div>
                </header>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setActiveTab("dashboard")}
                        className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${activeTab === "dashboard"
                                ? "bg-sky-500/25 text-sky-100 border-sky-300/40"
                                : "bg-secondary/45 text-slate-300 border-sky-300/20 hover:bg-secondary/65"
                            }`}
                    >
                        Visão Geral
                    </button>
                    <button
                        onClick={() => setActiveTab("principais-erros")}
                        className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${activeTab === "principais-erros"
                                ? "bg-red-500/20 text-red-100 border-red-300/40"
                                : "bg-secondary/45 text-slate-300 border-sky-300/20 hover:bg-secondary/65"
                            }`}
                    >
                        Principais Erros
                    </button>
                </div>

                {activeTab === "dashboard" ? (
                    <>

                {/* Dashboard Cards Layout */}
                <section className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:grid-rows-2">
                    <div className="glass-panel camo-panel rounded-xl p-6 flex flex-col justify-between border border-sky-300/20 xl:col-start-1 xl:col-end-2 xl:row-start-1 xl:row-end-2">
                        <div className="p-3 rounded-lg bg-sky-500/20 border border-sky-200/20 w-fit">
                            <Phone className="w-6 h-6 text-sky-200" />
                        </div>
                        <div className="mt-4">
                            <h3 className="text-sm font-medium text-slate-300">Total de Ligações</h3>
                            <p className="text-3xl font-bold mt-1 text-sky-50 tracking-tight">{totalCalls}</p>
                        </div>
                    </div>

                    <div className="glass-panel camo-panel rounded-xl p-6 flex flex-col justify-between border border-cyan-300/20 xl:col-start-1 xl:col-end-2 xl:row-start-2 xl:row-end-3">
                        <div className="p-3 rounded-lg bg-cyan-500/20 border border-cyan-200/20 w-fit">
                            <CalendarCheck className="w-6 h-6 text-cyan-200" />
                        </div>
                        <div className="mt-4">
                            <h3 className="text-sm font-medium text-slate-300">Reuniões Marcadas</h3>
                            <p className="text-3xl font-bold mt-1 text-sky-50 tracking-tight">{scheduledCalls}</p>
                            <p className="text-xs text-slate-400 mt-1">{totalCalls > 0 ? `${scheduledPct}% de taxa` : "Sem ligações no período"}</p>
                        </div>
                    </div>

                    <div className="glass-panel camo-panel rounded-xl p-6 flex flex-col justify-between border border-blue-300/20 xl:col-start-2 xl:col-end-3 xl:row-start-1 xl:row-end-2">
                        <div className="p-3 rounded-lg bg-blue-500/20 border border-blue-200/20 w-fit">
                            <TrendingUp className="w-6 h-6 text-blue-200" />
                        </div>
                        <div className="mt-4">
                            <h3 className="text-sm font-medium text-slate-300">Score Médio</h3>
                            <p className="text-3xl font-bold mt-1 text-sky-50 tracking-tight">{avgScore}</p>
                            <p className="text-xs text-slate-400 mt-1">Média geral das ligações</p>
                        </div>
                    </div>

                    <div className="glass-panel camo-panel rounded-xl p-5 border border-amber-300/30 bg-amber-500/5 xl:col-start-2 xl:col-end-3 xl:row-start-2 xl:row-end-3">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                                <p className="text-xs uppercase tracking-wider text-amber-200/80 font-semibold">Caixa Postal</p>
                                <h3 className="text-sm font-semibold text-amber-100 mt-1">Tentativas com Erro</h3>
                            </div>
                            <div className="px-2 py-1 rounded-md bg-amber-500/15 border border-amber-300/25 text-amber-100 text-xs font-semibold">
                                Planilha externa
                            </div>
                        </div>

                        <div className="text-4xl font-bold text-amber-100 leading-none">
                            {voicemailLoading ? "..." : voicemailAccessError ? "—" : voicemailFilteredStats.errorAttempts}
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                            {voicemailAccessError || `${voicemailFilteredStats.totalAttempts} tentativas analisadas em ${voicemailFilteredStats.totalRows} linhas (com filtros).`}
                        </p>

                        <a
                            href={VOICEMAIL_SHEET_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100 text-xs font-semibold transition-colors"
                        >
                            <ExternalLink size={13} />
                            Abrir planilha
                        </a>
                    </div>

                    <div className="glass-panel camo-panel rounded-xl p-6 flex flex-col items-center justify-center border border-sky-300/20 xl:col-start-3 xl:col-end-4 xl:row-start-1 xl:row-end-3">
                        <h3 className="w-full text-lg font-semibold mb-4 text-sky-100 text-left">Distribuição de Agendamentos</h3>
                        <SatisfactionChart data={filteredData} />
                    </div>
                </section>

                <div className="flex justify-end gap-2 flex-wrap">
                    <button
                        onClick={() => setFiltersOpen((prev) => !prev)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-secondary/45 hover:bg-secondary/65 text-slate-200 border border-sky-300/20 rounded-lg transition-colors text-sm font-semibold"
                    >
                        <Filter size={15} />
                        {filtersOpen ? "Ocultar filtros" : "Mostrar filtros"}
                        {filtersOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <button
                        onClick={() => setRankingModalOpen(true)}
                        className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/35 text-sky-100 border border-blue-300/35 rounded-lg transition-colors text-sm font-semibold glass-panel"
                    >
                        Ver ranking
                    </button>
                </div>

                {/* Filters Row */}
                {filtersOpen && (
                <section className="glass-panel camo-panel rounded-xl p-5 border border-sky-300/20 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-sky-200" />
                                <h3 className="text-sm font-semibold text-sky-100">Filtros da Visão Geral</h3>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                Mostrando {filteredData.length} de {data.length} ligações
                            </p>
                        </div>
                        {hasActiveFilters && (
                            <span className="inline-flex items-center w-fit px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-500/15 border border-sky-300/25 text-sky-100">
                                Filtros ativos
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                        <div className="lg:col-span-5">
                            <label className="block text-xs text-slate-300 mb-1.5 font-medium">Buscar prospect ou empresa</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Ex.: Acme, Tech Corp..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-secondary/45 border border-sky-300/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500/60 text-sm text-sky-50 placeholder-slate-400"
                                />
                            </div>
                        </div>

                        <div className="lg:col-span-3">
                            <label className="block text-xs text-slate-300 mb-1.5 font-medium">SDR responsável</label>
                            <div className="relative">
                                <select
                                    value={sdrFilter}
                                    onChange={(e) => setSdrFilter(e.target.value)}
                                    className="w-full pl-10 pr-9 py-2.5 bg-secondary/45 border border-sky-300/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500/60 text-sm appearance-none cursor-pointer text-sky-50"
                                >
                                    <option value="all" className="bg-[#1e1e1e] text-gray-300">Todos os SDRs</option>
                                    {sdrs.map((sdr) => (
                                        <option key={sdr.key} value={sdr.key} className="bg-[#1e1e1e] text-gray-300">{sdr.label}</option>
                                    ))}
                                </select>
                                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                            </div>
                        </div>

                        <div className="lg:col-span-3">
                            <label className="block text-xs text-slate-300 mb-1.5 font-medium">Status da ligação</label>
                            <div className="relative">
                                <select
                                    value={meetingFilter}
                                    onChange={(e) => setMeetingFilter(e.target.value)}
                                    className="w-full pl-10 pr-9 py-2.5 bg-secondary/45 border border-sky-300/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500/60 text-sm appearance-none cursor-pointer text-sky-50"
                                >
                                    <option value="all" className="bg-[#1e1e1e] text-gray-300">Todas as ligações</option>
                                    <option value="yes" className="bg-[#1e1e1e] text-gray-300">Reunião marcada</option>
                                    <option value="no" className="bg-[#1e1e1e] text-gray-300">Sem reunião</option>
                                </select>
                                <PhoneCall className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                            </div>
                        </div>

                        <div className="lg:col-span-1 flex lg:items-end">
                            <button
                                onClick={clearFilters}
                                disabled={!hasActiveFilters}
                                className="inline-flex items-center justify-center gap-2 w-full px-3 py-2.5 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Eraser size={13} />
                                Limpar
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl border border-sky-300/20 bg-secondary/25 p-3">
                        <div className="flex flex-col xl:flex-row xl:items-end gap-3">
                            <div className="xl:min-w-[300px]">
                                <label className="block text-xs text-slate-300 mb-2 font-medium">Período (data)</label>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => applyDatePreset("today")}
                                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${datePreset === "today"
                                                ? "bg-sky-500/25 text-sky-100 border-sky-300/40"
                                                : "bg-white/5 text-slate-300 border-white/15 hover:bg-white/10"
                                            }`}
                                    >
                                        Hoje
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyDatePreset("yesterday")}
                                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${datePreset === "yesterday"
                                                ? "bg-sky-500/25 text-sky-100 border-sky-300/40"
                                                : "bg-white/5 text-slate-300 border-white/15 hover:bg-white/10"
                                            }`}
                                    >
                                        Ontem
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => applyDatePreset("this-week")}
                                        className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${datePreset === "this-week"
                                                ? "bg-sky-500/25 text-sky-100 border-sky-300/40"
                                                : "bg-white/5 text-slate-300 border-white/15 hover:bg-white/10"
                                            }`}
                                    >
                                        Essa semana
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full">
                                <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">De</label>
                                    <div className="relative">
                                        <CalendarRange className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                        <input
                                            type="date"
                                            value={startDateFilter}
                                            onChange={(e) => handleStartDateChange(e.target.value)}
                                            className="w-full pl-10 pr-3 py-2.5 bg-secondary/45 border border-sky-300/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500/60 text-sm text-sky-50"
                                            aria-label="Data inicial"
                                            title="Data inicial"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">Até</label>
                                    <div className="relative">
                                        <CalendarRange className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                        <input
                                            type="date"
                                            value={endDateFilter}
                                            onChange={(e) => handleEndDateChange(e.target.value)}
                                            className="w-full pl-10 pr-3 py-2.5 bg-secondary/45 border border-sky-300/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500/60 text-sm text-sky-50"
                                            aria-label="Data final"
                                            title="Data final"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                )}

                {/* Table Section */}
                <section className="glass-panel camo-panel rounded-xl overflow-hidden">
                    <div className="flex justify-between items-center p-5 border-b border-white/5">
                        <h2 className="impact-title text-3xl text-sky-100">Ligações de Pré-Vendas</h2>
                        <div className="text-xs text-gray-500">
                            {lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR")}` : "Carregue uma planilha para começar"}
                        </div>
                    </div>
                    {loading ? (
                        <div className="flex justify-center items-center py-20 gap-3">
                                <RefreshCcw className="animate-spin text-sky-300 w-5 h-5" />
                            <span className="text-gray-500 text-sm">Carregando planilha...</span>
                        </div>
                    ) : (
                        <ClientTable data={filteredData} onOpenModal={openModal} />
                    )}
                </section>
                    </>
                ) : errorsLoading ? (
                    <div className="flex justify-center items-center py-24 gap-3">
                        <RefreshCcw className="animate-spin text-red-300 w-5 h-5" />
                        <span className="text-gray-500 text-sm">Carregando dados de erros...</span>
                    </div>
                ) : errorsFetchError ? (
                    <div className="glass-panel camo-panel rounded-xl p-8 border border-red-300/20 text-center">
                        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                        <p className="text-sm text-red-200 font-semibold">Erro ao carregar dados da planilha</p>
                        <p className="text-xs text-slate-400 mt-1 mb-4">{errorsFetchError}</p>
                        <button
                            onClick={fetchErrorsData}
                            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-300/25 rounded-lg text-sm font-medium transition-colors"
                        >
                            Tentar novamente
                        </button>
                    </div>
                ) : (
                    <section className="glass-panel camo-panel rounded-xl p-5 md:p-6 border border-red-300/10">
                                                {/* Day filter for Principais Erros */}
                                                <div className="mb-4 flex items-center gap-2">
                                                    <label htmlFor="mainErrorsDay" className="text-xs text-slate-300 font-medium">Filtrar por dia:</label>
                                                    <input
                                                        id="mainErrorsDay"
                                                        type="date"
                                                        value={mainErrorsDay}
                                                        onChange={e => setMainErrorsDay(e.target.value)}
                                                        className="px-2 py-1 rounded border border-sky-300/20 bg-secondary/30 text-sky-100 text-xs"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="text-xs text-sky-200 underline"
                                                        onClick={() => setMainErrorsDay("")}
                                                    >Limpar filtro</button>
                                                </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-5 border-b border-white/5">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-xs font-semibold text-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Conectado
                                </span>
                                <span className="text-xs text-slate-400 break-all">
                                    planilha <span className="text-slate-300 font-medium">Principais Erros</span>
                                </span>
                            </div>
                            <div className="text-xs text-gray-500">
                                {errorsLastUpdated
                                    ? `Atualizado às ${errorsLastUpdated.toLocaleTimeString("pt-BR")}`
                                    : "Sincronizando..."}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-1 gap-y-6">
                            <div className="xl:col-span-2 space-y-4">
                                <div>
                                    <h2 className="impact-title text-3xl text-red-100">TOP Erros</h2>
                                    <p className="text-xs text-slate-400 mt-1">Erros consolidados do período analisado</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {topErrors.map((item, idx) => (
                                        <div key={`${item.erro}-${idx}`} className="rounded-xl border border-red-300/15 bg-red-500/5 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-sm text-red-50 font-semibold leading-relaxed">{item.erro}</p>
                                                <span className="text-2xl font-bold text-red-100 shrink-0">{item.quantidade}</span>
                                            </div>
                                            <div className="text-xs text-slate-400 mt-2">Categoria: {item.categoria || "Geral"}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="rounded-xl border border-sky-300/15 bg-sky-500/5 p-4">
                                    <h3 className="text-sm font-semibold text-sky-200 mb-2">Insight</h3>
                                    <p className="text-sm text-slate-300 leading-relaxed">{insightText}</p>
                                </div>
                                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                                    <div className="text-xs text-slate-400">Data de referência</div>
                                    <div className="text-lg font-semibold text-sky-100 mt-1">{errorsDate}</div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6">
                            <h3 className="text-lg font-semibold text-sky-100 mb-3">Erros por SDR</h3>
                            <div className="overflow-x-auto rounded-xl border border-white/10">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-secondary/40 text-xs uppercase text-slate-300 font-medium tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3">SDR</th>
                                            <th className="px-4 py-3">Total de Erros</th>
                                            <th className="px-4 py-3">Top 3 Erros</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-sky-200/10">
                                        {sdrErrorsRanking.map((item) => (
                                            <tr key={item.nome} className="hover:bg-blue-500/10 transition-colors">
                                                <td className="px-4 py-3 text-slate-100 font-semibold whitespace-nowrap">{item.nome}</td>
                                                <td className="px-4 py-3 text-red-200 font-semibold whitespace-nowrap">{item.total}</td>
                                                <td className="px-4 py-3 text-slate-300">
                                                    <div className="flex flex-wrap gap-2">
                                                        {item.erros.map((errorItem, index) => (
                                                            <span
                                                                key={`${item.nome}-${errorItem.erro}-${index}`}
                                                                className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs"
                                                            >
                                                                {errorItem.erro} ({errorItem.quantidade})
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                )}
            </div>

            {/* Modal */}
            {sheetModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-[#0b1224] border border-sky-300/20 rounded-xl max-w-xl w-full shadow-2xl">
                        <div className="flex justify-between items-center p-5 border-b border-white/5">
                            <h3 className="impact-title text-3xl text-sky-100">Conectar Planilha</h3>
                            <button
                                onClick={() => setSheetModalOpen(false)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                                        {/* Principais Erros Header */}
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 pb-5 border-b border-white/5">
                            <input
                                type="text"
                                placeholder="Cole aqui o link da planilha..."
                                value={sheetInputValue}
                                onChange={(e) => setSheetInputValue(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleLoadSheet()}
                                className="w-full px-4 py-2 bg-secondary/45 border border-sky-300/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-sky-500/60 text-sm text-sky-50 placeholder-slate-400"
                            />
                        </div>
                        <div className="p-4 border-t border-white/5 flex justify-end gap-2 bg-white/5 rounded-b-xl">
                            <button
                                onClick={() => setSheetModalOpen(false)}
                                className="px-4 py-2 bg-secondary/50 hover:bg-secondary text-white rounded-lg text-sm font-medium transition-colors border border-white/5"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleLoadSheet}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
                            >
                                Carregar Planilha
                            </button>
                        </div>
                    </div>
                </div>
                </div>
            )}

            {/* Ranking Modal */}
            {rankingModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-[#0b1224] border border-sky-300/20 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center p-5 border-b border-white/5 shrink-0">
                            <h3 className="impact-title text-3xl text-sky-100">Ranking de SDR por Resultados</h3>
                            <button
                                onClick={() => setRankingModalOpen(false)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto custom-scrollbar">
                            {sdrRanking.length === 0 && sdrCallsRanking.length === 0 && sdrScoreRanking.length === 0 ? (
                                <p className="text-sm text-gray-500">Sem dados para montar o ranking.</p>
                            ) : (
                                <div className="mt-8">
                                    <div>
                                        <h4 className="text-sm font-semibold text-sky-200 mb-2">Reuniões Agendadas</h4>
                                        <div className="space-y-2">
                                            {sdrRanking.map((item, idx) => (
                                                <div
                                                    key={`meetings-${item.name}`}
                                                    className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-4 py-2"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-7 h-7 rounded-full bg-blue-500/25 text-sky-200 text-xs font-bold flex items-center justify-center">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="text-sm text-gray-200 font-medium">{item.name}</span>
                                                    </div>
                                                    <span className="text-sm text-sky-200 font-semibold">
                                                        {item.meetings} {item.meetings === 1 ? "reunião" : "reuniões"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-cyan-200 mb-2">Ligações Realizadas</h4>
                                        <div className="space-y-2">
                                            {sdrCallsRanking.map((item, idx) => (
                                                <div
                                                    key={`calls-${item.name}`}
                                                    className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-4 py-2"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-7 h-7 rounded-full bg-cyan-500/25 text-cyan-200 text-xs font-bold flex items-center justify-center">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="text-sm text-gray-200 font-medium">{item.name}</span>
                                                    </div>
                                                    <span className="text-sm text-cyan-200 font-semibold">
                                                        {item.calls} {item.calls === 1 ? "ligação" : "ligações"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-emerald-200 mb-2">Ranking por Nota Média</h4>
                                        <div className="space-y-2">
                                            {sdrScoreRanking.map((item, idx) => (
                                                <div
                                                    key={`score-${item.name}`}
                                                    className="flex items-center justify-between bg-white/5 border border-white/5 rounded-lg px-4 py-2"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-7 h-7 rounded-full bg-emerald-500/25 text-emerald-200 text-xs font-bold flex items-center justify-center">
                                                            {idx + 1}
                                                        </span>
                                                        <div>
                                                            <span className="text-sm text-gray-200 font-medium block">{item.name}</span>
                                                            <span className="text-xs text-slate-400">{item.scoredCalls} ligaç{item.scoredCalls === 1 ? "ão" : "ões"} com nota</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-sm text-emerald-200 font-semibold">
                                                        {item.averageScore.toFixed(2)} / 10
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-white/5 flex justify-end bg-white/5 rounded-b-xl shrink-0">
                            <button
                                onClick={() => setRankingModalOpen(false)}
                                className="px-4 py-2 bg-secondary/50 hover:bg-secondary text-white rounded-lg text-sm font-medium transition-colors border border-white/5"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {errorsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-[#0b1224] border border-red-300/20 rounded-xl max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="flex justify-between items-center p-5 border-b border-white/5 shrink-0">
                            <div>
                                <h3 className="impact-title text-3xl text-red-100">Erros Mais Recorrentes</h3>
                                <p className="text-xs text-slate-400 mt-1">
                                    Baseado nas {filteredData.length} ligações exibidas pelos filtros atuais
                                </p>
                            </div>
                            <button
                                onClick={() => setErrorsModalOpen(false)}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto custom-scrollbar">
                            {recurringCriticalErrors.length === 0 ? (
                                <p className="text-sm text-gray-500">Nenhum erro crítico encontrado nas ligações filtradas.</p>
                            ) : (
                                <div className="space-y-3">
                                    {recurringCriticalErrors.map((item, idx) => {
                                        const visibleProspects = item.prospects.slice(0, 3);
                                        const remainingProspects = item.prospects.length - visibleProspects.length;

                                        return (
                                            <div
                                                key={item.key}
                                                className="rounded-xl border border-red-300/15 bg-red-500/5 p-4"
                                            >
                                                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                                    <div className="flex items-start gap-3 min-w-0">
                                                        <span className="w-8 h-8 rounded-full bg-red-500/15 text-red-200 text-xs font-bold flex items-center justify-center shrink-0">
                                                            {idx + 1}
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-red-100 leading-relaxed">{item.label}</p>
                                                            <div className="flex flex-wrap gap-2 mt-3">
                                                                {visibleProspects.map((prospect) => (
                                                                    <span
                                                                        key={prospect}
                                                                        className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-slate-300"
                                                                    >
                                                                        {prospect}
                                                                    </span>
                                                                ))}
                                                                {remainingProspects > 0 && (
                                                                    <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-slate-400">
                                                                        +{remainingProspects} prospect{remainingProspects > 1 ? "s" : ""}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-left md:text-right shrink-0">
                                                        <div className="text-2xl font-bold text-red-100">{item.count}</div>
                                                        <div className="text-xs text-slate-400">
                                                            {item.count === 1 ? "ocorrência" : "ocorrências"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-white/5 flex justify-end bg-white/5 rounded-b-xl shrink-0">
                            <button
                                onClick={() => setErrorsModalOpen(false)}
                                className="px-4 py-2 bg-secondary/50 hover:bg-secondary text-white rounded-lg text-sm font-medium transition-colors border border-white/5"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal */}
            {modalOpen && modalRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="bg-[#0b1224] border border-sky-300/20 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
                        {/* Modal Header */}
                        <div className="flex justify-between items-start p-6 border-b border-white/5 shrink-0">
                            <div>
                                <h3 className="impact-title text-3xl text-sky-100 leading-none">{normalizeText(modalRow["Prospect / Empressa"] || "") || "Prospect não informado"}</h3>
                                <div className="flex gap-3 mt-1 text-xs text-gray-400">
                                    <span>SDR: <span className="text-gray-200">{normalizeText(modalRow["SDR / Pré-venda"] || "")}</span></span>
                                    <span className="text-gray-600">•</span>
                                    <span>Data: <span className="text-gray-200">{formatDateTime(modalRow["Data"])}</span></span>
                                </div>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white transition-colors ml-4 shrink-0">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
                            {/* Probabilidade Show */}
                            {modalRow["Probabilidade Show"] && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-300 mb-1">Probabilidade de Show</h4>
                                    <p className="text-sm text-gray-400 bg-white/5 rounded-lg p-3 leading-relaxed">{modalRow["Probabilidade Show"]}</p>
                                </div>
                            )}

                            {/* Scores */}
                            <div>
                                <h4 className="text-sm font-semibold text-gray-300 mb-2">Scores da Ligação</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {["Conexão/Rapport", "Apres. Autoridade", "Entendimento Dores", "Apres. Solução", "Agendamento"].map(key => {
                                        const val = parseFloat(modalRow[key]);
                                        const tone = isNaN(val)
                                            ? {
                                                text: "text-slate-400",
                                                border: "border-slate-500/25",
                                                bg: "bg-slate-500/8",
                                            }
                                            : val >= 7
                                                ? {
                                                    text: "text-emerald-300",
                                                    border: "border-emerald-400/30",
                                                    bg: "bg-emerald-500/10",
                                                }
                                                : val >= 4
                                                    ? {
                                                        text: "text-amber-300",
                                                        border: "border-amber-400/30",
                                                        bg: "bg-amber-500/10",
                                                    }
                                                    : {
                                                        text: "text-red-300",
                                                        border: "border-red-400/30",
                                                        bg: "bg-red-500/10",
                                                    };
                                        return (
                                            <div key={key} className={`rounded-lg p-3 text-center border ${tone.border} ${tone.bg}`}>
                                                <div className={`text-2xl font-bold ${tone.text}`}>{isNaN(val) ? "—" : val}</div>
                                                <div className="text-xs text-slate-400 mt-1 leading-tight">{key}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Dores Identificadas */}
                            {(() => {
                                const dores = parseListOrTextField(modalRow["Dores Identificadas"]);
                                if (!dores || dores.length === 0) return null;
                                return (
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-300 mb-2">Dores Identificadas</h4>
                                        <ul className="space-y-1">
                                            {dores.map((d, i) => (
                                                <li key={i} className="flex gap-2 text-sm text-gray-400">
                                                    <span className="text-sky-400 shrink-0 mt-0.5">•</span>
                                                    <span>{d}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })()}

                            {/* Erros Críticos */}
                            {(() => {
                                const erros = parseListOrTextField(modalRow["Erros Criticos"]);
                                if (!erros || erros.length === 0) return null;
                                return (
                                    <div>
                                        <h4 className="text-sm font-semibold text-cyan-300 mb-2">Erros Críticos</h4>
                                        <ul className="space-y-2">
                                            {erros.map((e, i) => (
                                                <li key={i} className="text-sm text-gray-400 bg-cyan-500/5 border border-cyan-400/20 rounded-lg p-2 flex gap-2">
                                                    <span className="text-cyan-300 font-bold shrink-0">{i + 1}.</span>
                                                    <span dangerouslySetInnerHTML={{ __html: String(e).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })()}

                            {/* Checklist de Melhoria */}
                            {(() => {
                                const checklist = parseChecklistField(modalRow["Checklist de Melhoria"]);
                                const checklistFallback = cleanRichText(modalRow["Checklist de Melhoria"]);
                                const looksLikeBrokenJson = /^\s*[\[{].*[:\]}]\s*$/.test(checklistFallback);
                                if ((!checklist || checklist.length === 0) && (!checklistFallback || looksLikeBrokenJson)) return null;

                                if (!checklist || checklist.length === 0) {
                                    return (
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-300 mb-2">Checklist de Melhoria</h4>
                                            <p className="text-sm text-gray-400 bg-white/5 rounded-lg p-3 leading-relaxed">{checklistFallback}</p>
                                        </div>
                                    );
                                }

                                return (
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-300 mb-2">Checklist de Melhoria</h4>
                                        {checklist.map((cat, cidx) => (
                                            <div key={cidx} className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
                                                <div className="text-xs font-semibold text-sky-300 uppercase tracking-wider mb-2">{cat.categoria}</div>
                                                <ul className="space-y-2">
                                                    {(cat.itens || []).map((item, iidx) => (
                                                        <li key={iidx} className="rounded-lg border border-white/10 bg-[#101a35]/55 p-2.5">
                                                            <div className="flex items-start gap-2 text-sm">
                                                                <span className={`mt-0.5 ${item.concluido ? "text-emerald-300" : "text-amber-300"}`}>
                                                                    {item.concluido ? "✓" : "○"}
                                                                </span>
                                                                <div className="min-w-0">
                                                                    <p className={`${isChecklistSectionTitle(formatChecklistItemText(item.item)) ? "text-sky-200 font-semibold" : item.concluido ? "text-gray-300" : "text-gray-400"} leading-relaxed`}>
                                                                        {formatChecklistItemText(item.item)}
                                                                    </p>
                                                                    {item.status && (
                                                                        <span className={`inline-flex mt-2 px-2 py-0.5 rounded-md text-[11px] border ${item.concluido
                                                                            ? "bg-emerald-500/12 text-emerald-200 border-emerald-400/25"
                                                                            : "bg-amber-500/10 text-amber-200 border-amber-400/25"
                                                                            }`}>
                                                                            {item.status}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}

                            {/* Link Documento */}
                            {modalRow["Link Documento"] && (
                                <a
                                    href={modalRow["Link Documento"]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-sm text-sky-300 hover:text-sky-200 transition-colors"
                                >
                                    <ExternalLink size={14} />
                                    Ver Documento Completo
                                </a>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-white/5 flex justify-end bg-white/5 rounded-b-xl shrink-0">
                            <button
                                onClick={() => setModalOpen(false)}
                                className="px-4 py-2 bg-secondary/50 hover:bg-secondary text-white rounded-lg text-sm font-medium transition-colors border border-white/5"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
