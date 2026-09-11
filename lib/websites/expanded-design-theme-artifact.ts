import "server-only";

/** Visual token overrides for premium families beyond the original renderer palette.
 * Composition layout still comes from the existing renderer; this layer only
 * gives each expanded family a deliberately different hospitality palette.
 */
export function expandedWebsiteDesignStyles() {
  return `
.composition-chef_counter{--bg:#11100e;--surface:#191714;--surface2:#24211c;--text:#f4efe7;--muted:#aaa196;--accent:#c7a66a;--accentText:#16120c;--border:#332e27}
.composition-brunch_social{--bg:#fff7ef;--surface:#fffdf9;--surface2:#f7e5d3;--text:#35251f;--muted:#806b61;--accent:#d76278;--accentText:#fff;--border:#ead6c8}
.composition-fast_casual_polished{--bg:#f5f2e9;--surface:#fffef9;--surface2:#e9e2d2;--text:#20211d;--muted:#696b62;--accent:#d14b2e;--accentText:#fff;--border:#d9d2c4}
.composition-social_games{--bg:#0b1020;--surface:#111a30;--surface2:#192542;--text:#f7f9ff;--muted:#aab4ce;--accent:#62dcff;--accentText:#061018;--border:#293754}
.composition-family_entertainment{--bg:#fff8e8;--surface:#fffdf7;--surface2:#f7e4ba;--text:#302919;--muted:#786c50;--accent:#e96f35;--accentText:#fff;--border:#ead9b8}
.composition-wellness_retreat{--bg:#edf0e8;--surface:#f9faf6;--surface2:#dde4d7;--text:#29332b;--muted:#69756b;--accent:#738c73;--accentText:#fff;--border:#ccd5c9}
.composition-arts_culture{--bg:#f0efe9;--surface:#faf9f5;--surface2:#dfddd4;--text:#171717;--muted:#6d6b65;--accent:#a22c2c;--accentText:#fff;--border:#cfcdc5}
.composition-cinematic_entertainment{--bg:#090b11;--surface:#10141e;--surface2:#1a2130;--text:#f5f6fa;--muted:#9fa6b6;--accent:#e0b14f;--accentText:#120e07;--border:#293140}
.composition-modern_steakhouse{--bg:#0c0b0a;--surface:#151311;--surface2:#211d19;--text:#f1e8dc;--muted:#9e9183;--accent:#b86e3f;--accentText:#fff7ee;--border:#302a24}
.composition-sushi_modern{--bg:#f1f0ec;--surface:#fbfaf7;--surface2:#e2e0da;--text:#181b1a;--muted:#666b68;--accent:#374f49;--accentText:#fff;--border:#d0cfca}
.composition-tropical_caribbean{--bg:#fff1db;--surface:#fff9ee;--surface2:#f4d8ae;--text:#183b35;--muted:#687d70;--accent:#e05f35;--accentText:#fff;--border:#e7cda8}
.composition-latin_night{--bg:#14080d;--surface:#211018;--surface2:#351728;--text:#fff1e9;--muted:#c0a4a8;--accent:#f05a4f;--accentText:#fff;--border:#4a2332}
.composition-rooftop_city{--bg:#0b1015;--surface:#121b22;--surface2:#1d2932;--text:#eef5f8;--muted:#a1b0b8;--accent:#d7b979;--accentText:#10100d;--border:#2d3b44}
.composition-garden_terrace{--bg:#eff1e6;--surface:#fbfcf6;--surface2:#dce4cc;--text:#243123;--muted:#6f7b69;--accent:#6d844e;--accentText:#fff;--border:#cdd6bf}
.composition-wine_cellar{--bg:#17100f;--surface:#211716;--surface2:#31201e;--text:#f3e8df;--muted:#ad9990;--accent:#a75b52;--accentText:#fff;--border:#422d29}
.composition-craft_brewery{--bg:#f0e7d7;--surface:#fbf6ed;--surface2:#dfcfb3;--text:#33271c;--muted:#776757;--accent:#8b5a2b;--accentText:#fff;--border:#cfbea3}
.composition-sports_watch{--bg:#0a1010;--surface:#111b19;--surface2:#1a2825;--text:#f5faf8;--muted:#a1b3ac;--accent:#78d49c;--accentText:#07120c;--border:#293b35}
.composition-jazz_room{--bg:#0e0b0c;--surface:#171214;--surface2:#261b20;--text:#f4ece4;--muted:#aa9a95;--accent:#bd8f55;--accentText:#160e07;--border:#36282d}
.composition-comedy_club{--bg:#11100f;--surface:#1d1a18;--surface2:#2c2723;--text:#faf5ec;--muted:#b0a69a;--accent:#efbd3c;--accentText:#171106;--border:#3c352e}
.composition-karaoke_social{--bg:#100b1b;--surface:#1a112d;--surface2:#291b43;--text:#faf3ff;--muted:#b6a7c8;--accent:#e766d8;--accentText:#1a0718;--border:#3c2857}
.composition-arcade_neon{--bg:#080c18;--surface:#0f1629;--surface2:#17213b;--text:#f5f7ff;--muted:#9da9ca;--accent:#66f2ce;--accentText:#061410;--border:#283451}
.composition-bowling_luxe{--bg:#0d1118;--surface:#151b25;--surface2:#202937;--text:#f3f6fa;--muted:#a4afbd;--accent:#d4a665;--accentText:#141006;--border:#313c4b}
.composition-escape_cinematic{--bg:#090b0d;--surface:#11161a;--surface2:#1a2228;--text:#edf2f2;--muted:#9ba9aa;--accent:#cb9645;--accentText:#120e08;--border:#293339}
.composition-mini_golf_playful{--bg:#f2f8e9;--surface:#fbfff6;--surface2:#dfeecb;--text:#26351e;--muted:#6b7c60;--accent:#54a95a;--accentText:#fff;--border:#ceddbc}
.composition-museum_modern{--bg:#f2f1ed;--surface:#fdfcf9;--surface2:#e2e0da;--text:#151515;--muted:#696866;--accent:#315e79;--accentText:#fff;--border:#d2d0cb}
.composition-theater_grand{--bg:#100b0c;--surface:#1a1113;--surface2:#28191c;--text:#f7ede5;--muted:#ad9994;--accent:#c49a57;--accentText:#140f08;--border:#382529}
.composition-spa_serene{--bg:#edf2ef;--surface:#fafcfb;--surface2:#dce7e1;--text:#26322e;--muted:#6e7a75;--accent:#77958a;--accentText:#fff;--border:#ccd9d2}
.composition-dessert_bakery{--bg:#fff4f1;--surface:#fffafa;--surface2:#f5ded9;--text:#3a2726;--muted:#826a68;--accent:#cf6e73;--accentText:#fff;--border:#e8d1cd}
.composition-coffee_roastery{--bg:#eee7dd;--surface:#faf6f0;--surface2:#dfd2c1;--text:#30251e;--muted:#73665d;--accent:#835d42;--accentText:#fff;--border:#cebfad}
.composition-private_events{--bg:#f0eee8;--surface:#fbfaf7;--surface2:#e1ddd2;--text:#24211e;--muted:#706b65;--accent:#806b9c;--accentText:#fff;--border:#d1ccc1}

.composition-social_games .hero-media,.composition-arcade_neon .hero-media,.composition-karaoke_social .hero-media{box-shadow:0 30px 100px color-mix(in srgb,var(--accent) 16%,transparent)}
.composition-rooftop_city .hero,.composition-theater_grand .hero,.composition-escape_cinematic .hero{min-height:780px}
.composition-sushi_modern .toh-menu-item,.composition-wine_cellar .toh-menu-item,.composition-jazz_room .toh-menu-item{border-radius:0;background:transparent;border-width:0 0 1px}
.composition-garden_terrace .toh-gallery-grid,.composition-spa_serene .toh-gallery-grid,.composition-wellness_retreat .toh-gallery-grid{gap:24px}
.composition-sports_watch .toh-offerings-grid,.composition-comedy_club .toh-offerings-grid,.composition-private_events .toh-offerings-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-width:760px){.composition-sports_watch .toh-offerings-grid,.composition-comedy_club .toh-offerings-grid,.composition-private_events .toh-offerings-grid{grid-template-columns:1fr}}
`;
}
