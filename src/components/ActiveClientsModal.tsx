"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Client {
    id: string;
    full_name: string | null;
    email: string | null;
    // You can add avatar_url or other fields if available in your users table
}

interface ActiveClientsModalProps {
    isOpen: boolean;
    onClose: () => void;
    clients: Client[];
}

export function ActiveClientsModal({ isOpen, onClose, clients }: ActiveClientsModalProps) {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState("");
    const [animateIn, setAnimateIn] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setAnimateIn(true);
            document.body.style.overflow = "hidden";
        } else {
            setAnimateIn(false);
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        }
    }, [isOpen]);

    if (!isOpen && !animateIn) return null;

    const filteredClients = clients.filter((client) => {
        const name = client.full_name?.toLowerCase() || "";
        const email = client.email?.toLowerCase() || "";
        const term = searchTerm.toLowerCase();
        return name.includes(term) || email.includes(term);
    });

    const handleClientClick = (clientId: string) => {
        router.push(`/clients/${clientId}`);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}
                onClick={onClose}
            />

            {/* Modal Content */}
            <div
                className={`relative w-full max-w-2xl transform overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/90 shadow-2xl transition-all duration-500 ${isOpen ? "scale-100 opacity-100 translate-y-0" : "scale-95 opacity-0 translate-y-4"}`}
            >
                {/* Header */}
                <div className="relative border-b border-slate-800/50 bg-slate-900/50 p-6">
                    <h2 className="text-xl font-semibold text-slate-100">Active Clients</h2>
                    <p className="text-sm text-slate-400">
                        {clients.length} {clients.length === 1 ? 'client' : 'clients'} currently subscribed.
                    </p>
                    <button
                        onClick={onClose}
                        className="absolute right-6 top-6 rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                        aria-label="Close modal"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Search Bar (Optional, but good for UX) */}
                <div className="p-4 border-b border-slate-800/50 bg-slate-900/20">
                    <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-500">
                                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Search clients..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="block w-full rounded-xl border-0 bg-slate-800/50 py-2.5 pl-10 pr-4 text-slate-200 shadow-sm ring-1 ring-inset ring-slate-700/50 placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-amber-500/50 sm:text-sm sm:leading-6 transition-all"
                        />
                    </div>
                </div>

                {/* Client List */}
                <div className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin scrollbar-track-slate-900/20 scrollbar-thumb-slate-700/50">
                    {filteredClients.length === 0 ? (
                        <div className="py-12 text-center text-slate-500">
                            <p>No clients found matching "{searchTerm}"</p>
                        </div>
                    ) : (
                        <div className="grid gap-2">
                            {filteredClients.map((client) => {
                                // Generate initials
                                const initials = client.full_name
                                    ? client.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
                                    : "??";

                                return (
                                    <div
                                        key={client.id}
                                        onClick={() => handleClientClick(client.id)}
                                        className="group flex items-center justify-between rounded-xl p-3 hover:bg-slate-800/50 transition-all cursor-pointer border border-transparent hover:border-slate-700/50"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-sm font-semibold text-white shadow-lg">
                                                {initials}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-slate-200 group-hover:text-amber-200 transition-colors">
                                                    {client.full_name || "Unknown Client"}
                                                </p>
                                                <p className="truncate text-xs text-slate-500 group-hover:text-slate-400">
                                                    {client.email}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-slate-600 group-hover:text-amber-500/80 transition-colors">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                                                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-800/50 bg-slate-900/50 p-4 text-center">
                    <p className="text-xs text-slate-500">
                        Found {filteredClients.length} matching clients
                    </p>
                </div>
            </div>
        </div>
    );
}
