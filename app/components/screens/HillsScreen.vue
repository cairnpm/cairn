<script setup lang="ts">
const bike = useBicycle()
const { selectedHill, hillsOverview, hillDetail, hillFeatureDetail } = bike
</script>

<template>
  <!-- Overview -->
  <div v-if="selectedHill === null" style="display: flex; flex-direction: column; gap: 10px;">
    <div
      v-for="h in hillsOverview"
      :key="h.id"
      class="bk-hill"
      style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; cursor: pointer; transition: box-shadow 0.15s;"
      @click="bike.selectHill(h.id)"
    >
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="font-size: 15px; font-weight: 700; color: #18181b;">{{ h.name }}</span>
            <span :style="{ padding: '2px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: h.sBg, color: h.sColor }">{{ h.status }}</span>
          </div>
          <div style="font-size: 13px; color: #71717a;">{{ h.dates }}</div>
        </div>
        <div style="text-align: right; flex-shrink: 0; margin-left: 24px;">
          <div :style="{ fontSize: '28px', fontWeight: 800, color: h.pColor, lineHeight: 1 }">{{ h.pct }}</div>
          <div style="font-size: 11px; color: #a1a1aa; margin-top: 1px;">accompli</div>
        </div>
      </div>
      <div v-if="h.hasBar" style="height: 4px; background: #f4f4f5; border-radius: 99px; overflow: hidden; margin-bottom: 14px;">
        <div :style="{ height: '100%', background: h.pColor, width: h.barW }" />
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        <span v-for="pill in h.pills" :key="pill" style="font-size: 12px; padding: 3px 10px; background: #f4f4f5; color: #71717a; border-radius: 99px;">{{ pill }}</span>
      </div>
    </div>
  </div>

  <!-- Detail -->
  <div v-else-if="hillDetail" style="display: flex; gap: 20px; align-items: flex-start;">
    <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 20px;">
      <!-- Header card -->
      <div style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <span style="font-size: 18px; font-weight: 700; color: #18181b;">{{ hillDetail.name }}</span>
          <span :style="{ padding: '2px 9px', borderRadius: '99px', fontSize: '12px', fontWeight: 500, background: hillDetail.sBg, color: hillDetail.sColor }">{{ hillDetail.status }}</span>
        </div>
        <div style="font-size: 13px; color: #71717a; margin-bottom: 16px;">{{ hillDetail.dates }} · {{ hillDetail.duration }}</div>
        <div style="background: #fafafa; border: 1px solid #f4f4f5; border-radius: 6px; padding: 14px 16px;">
          <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px;">Rationale</div>
          <div style="font-size: 14px; color: #18181b; line-height: 1.7;">{{ hillDetail.why }}</div>
        </div>
      </div>

      <!-- Selected features -->
      <div v-if="hillDetail.selected.length">
        <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 12px;">Features sélectionnées</div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div
            v-for="f in hillDetail.selected"
            :key="f.title"
            class="bk-feat"
            style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 18px 20px; cursor: pointer;"
            @click="bike.openHillFeature(f.title)"
          >
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <div>
                <div style="font-size: 15px; font-weight: 600; color: #18181b; margin-bottom: 5px;">{{ f.title }}</div>
                <div style="display: flex; gap: 8px; font-size: 13px; color: #71717a; align-items: center; flex-wrap: wrap;">
                  <span>{{ f.owner }}</span>
                  <span style="color: #d4d4d8;">·</span>
                  <span>Effort {{ f.effort }}</span>
                  <span style="color: #d4d4d8;">·</span>
                  <a href="#" style="color: #2563eb; font-weight: 500; text-decoration: none; font-family: 'Courier New', monospace; font-size: 12px;">{{ f.pr }}</a>
                </div>
              </div>
              <div style="text-align: right; flex-shrink: 0; margin-left: 16px;">
                <div style="font-size: 20px; font-weight: 700; color: #18181b; line-height: 1;">{{ f.progress }}%</div>
                <div style="font-size: 11px; color: #a1a1aa; margin-top: 1px;">progression</div>
              </div>
            </div>
            <div style="height: 3px; background: #f4f4f5; border-radius: 99px; overflow: hidden; margin-bottom: 14px;">
              <div :style="{ height: '100%', background: '#18181b', width: f.barW }" />
            </div>
            <div style="display: flex; flex-direction: column; gap: 7px;">
              <div v-for="(v, i) in f.votes" :key="i" style="display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; background: #fafafa; border-radius: 6px; border: 1px solid #f4f4f5;">
                <div :title="v.user" :style="{ width: '24px', height: '24px', borderRadius: '50%', background: v.bg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }">{{ v.init }}</div>
                <div>
                  <div style="font-size: 12px; font-weight: 600; color: #18181b; margin-bottom: 2px;">{{ v.user }}</div>
                  <div style="font-size: 13px; color: #71717a; line-height: 1.45;">"{{ v.reason }}"</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Postponed features -->
      <div v-if="hillDetail.postponed.length">
        <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 12px;">Features reportées</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div v-for="p in hillDetail.postponed" :key="p.title" style="background: white; border: 1px solid #e4e4e7; border-radius: 8px; padding: 14px 20px; display: flex; gap: 14px; align-items: flex-start;">
            <div style="width: 6px; height: 6px; border-radius: 50%; background: #d4d4d8; flex-shrink: 0; margin-top: 6px;" />
            <div style="flex: 1;">
              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 5px;">
                <span style="font-size: 14px; font-weight: 600; color: #71717a;">{{ p.title }}</span>
                <span style="font-size: 11px; padding: 2px 7px; background: #f4f4f5; color: #a1a1aa; border-radius: 4px; font-family: 'Courier New', monospace;">{{ p.effort }}</span>
              </div>
              <div style="font-size: 13px; color: #71717a; line-height: 1.5;">{{ p.reason }}</div>
              <div style="font-size: 12px; color: #a1a1aa; margin-top: 5px;">Décision · {{ p.by }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Feature detail panel -->
    <div v-if="hillFeatureDetail" style="width: 340px; min-width: 340px; background: white; border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden; position: sticky; top: 0; max-height: 70vh; display: flex; flex-direction: column;">
      <div style="padding: 16px 20px; border-bottom: 1px solid #f4f4f5; display: flex; justify-content: space-between; align-items: flex-start; flex-shrink: 0;">
        <div style="flex: 1; margin-right: 12px;">
          <div style="font-size: 14px; font-weight: 600; color: #18181b; margin-bottom: 5px; line-height: 1.4;">{{ hillFeatureDetail.title }}</div>
          <div style="display: flex; gap: 8px; font-size: 13px; color: #71717a; align-items: center; flex-wrap: wrap;">
            <span>{{ hillFeatureDetail.owner }}</span>
            <span style="color: #e4e4e7;">·</span>
            <span>Effort {{ hillFeatureDetail.effort }}</span>
            <span style="color: #e4e4e7;">·</span>
            <a href="#" style="color: #2563eb; font-size: 12px; text-decoration: none; font-family: 'Courier New', monospace; font-weight: 500;">{{ hillFeatureDetail.pr }}</a>
          </div>
        </div>
        <button class="bk-close" style="width: 26px; height: 26px; border: none; background: #f4f4f5; border-radius: 5px; cursor: pointer; font-size: 16px; color: #71717a; display: flex; align-items: center; justify-content: center; flex-shrink: 0;" @click="bike.clearHillFeature()">×</button>
      </div>
      <div style="padding: 14px 20px; border-bottom: 1px solid #f4f4f5; flex-shrink: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 12px; color: #71717a; font-weight: 500;">Progression</span>
          <span style="font-size: 16px; font-weight: 700; color: #18181b;">{{ hillFeatureDetail.progress }}%</span>
        </div>
        <div style="height: 6px; background: #f4f4f5; border-radius: 99px; overflow: hidden;">
          <div :style="{ height: '100%', background: '#18181b', width: hillFeatureDetail.barW }" />
        </div>
      </div>
      <div style="padding: 16px 20px; overflow-y: auto; flex: 1;">
        <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 12px;">Pourquoi cette feature</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div v-for="(v, i) in hillFeatureDetail.votes" :key="i" style="display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; background: #fafafa; border: 1px solid #f4f4f5; border-radius: 6px;">
            <div :style="{ width: '24px', height: '24px', borderRadius: '50%', background: v.bg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }">{{ v.init }}</div>
            <div style="flex: 1;">
              <div style="font-size: 12px; font-weight: 600; color: #18181b; margin-bottom: 3px;">{{ v.user }}</div>
              <div style="font-size: 13px; color: #71717a; line-height: 1.5;">{{ v.reason }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bk-hill:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); border-color: #d4d4d8 !important; }
.bk-feat:hover { border-color: #d4d4d8 !important; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.bk-close:hover { background: #e4e4e7 !important; }
a:hover { text-decoration: underline !important; }
</style>
