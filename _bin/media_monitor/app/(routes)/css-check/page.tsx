import React from 'react';
import { CheckCircle, AlertTriangle, Info, Shield, Zap } from 'lucide-react';

export default function CssCheckPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            Tailwind CSS is <span className="text-blue-600">Working!</span>
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            This page is built entirely using Tailwind utility classes! No custom CSS modules were used. 
            Below are various UI components demonstrating modern styling techniques.
          </p>
        </div>

        {/* Grid of Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow duration-200 group">
            <div className="h-12 w-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Zap size={24} />
            </div>
            <h3 className="text-xl font-bold mb-2">Lightning Fast</h3>
            <p className="text-slate-500">Utility classes make styling incredibly fast without leaving your HTML.</p>
          </div>
          
          {/* Card 2 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow duration-200 group">
            <div className="h-12 w-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Shield size={24} />
            </div>
            <h3 className="text-xl font-bold mb-2">Highly Secure</h3>
            <p className="text-slate-500">Just a placeholder text to show off the cool hover effects and layout.</p>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow duration-200 group">
            <div className="h-12 w-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <CheckCircle size={24} />
            </div>
            <h3 className="text-xl font-bold mb-2">Fully Responsive</h3>
            <p className="text-slate-500">Resize your browser to see how this grid automatically adjusts.</p>
          </div>
        </div>

        {/* Buttons and Alerts */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 space-y-8">
          <div>
            <h2 className="text-2xl font-bold mb-4">Interactive Elements</h2>
            <div className="flex flex-wrap gap-4">
              <button className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm shadow-blue-200">
                Primary Button
              </button>
              <button className="px-6 py-2.5 bg-white text-slate-700 font-medium rounded-lg border border-slate-300 hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-sm">
                Secondary Button
              </button>
              <button className="px-6 py-2.5 bg-rose-50 text-rose-600 font-medium rounded-lg hover:bg-rose-100 active:bg-rose-200 transition-colors">
                Destructive
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-200 w-full"></div>

          <div>
            <h2 className="text-2xl font-bold mb-4">Alerts & Badges</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
                <AlertTriangle className="text-amber-500" size={20} />
                <span className="font-medium">Warning:</span> Please ensure you have saved your changes.
              </div>
              <div className="flex items-center gap-3 p-4 bg-sky-50 border border-sky-200 rounded-xl text-sky-800">
                <Info className="text-sky-500" size={20} />
                <span className="font-medium">Info:</span> Tailwind classes are automatically purged in production.
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                Active
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                Draft
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                New Feature
              </span>
            </div>
          </div>
        </div>

        {/* Complex Layout Demo */}
        <div className="bg-slate-900 rounded-3xl p-8 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full blur-2xl opacity-50"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-lg">
              <h2 className="text-3xl font-bold">Ready to modernize?</h2>
              <p className="text-slate-400">
                Start replacing your CSS modules with Tailwind utility classes. It might take a bit to get used to, but the speed and consistency gains are immense.
              </p>
            </div>
            <button className="whitespace-nowrap px-8 py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              Get Started Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
