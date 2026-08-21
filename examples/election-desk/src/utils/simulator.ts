import { useEffect, useState } from "react";
import { SEED_CANDIDATES, SEED_PARTIES } from "../config.js";
import { TURKEY_PROVINCES } from "../data/turkeyData.js";

export interface RegionData {
  id: string;
  name: string;
  openBoxRate: number;
  totalVotes: number;
  candidateVotes: Record<string, number>;
  partyVotes: Record<string, number>;
}

export interface CityData extends RegionData {
  districts: RegionData[];
}

export interface NationalData {
  openBoxRate: number;
  totalVotes: number;
  candidateVotes: Record<string, number>;
  partyVotes: Record<string, number>;
}

export interface LiveElectionData {
  nationalData: NationalData;
  citiesData: Record<string, CityData>;
}

const emptyVotes = () => {
  return {
    candidateVotes: SEED_CANDIDATES.reduce((acc, c) => ({ ...acc, [c.id]: 0 }), {}),
    partyVotes: SEED_PARTIES.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}),
  };
};

export const generateInitialData = (): LiveElectionData => {
  const citiesData: Record<string, CityData> = {};

  for (const [cityName, districtList] of Object.entries(TURKEY_PROVINCES)) {
    const districts = districtList.map((d) => ({
      id: d.toLowerCase(),
      name: d,
      openBoxRate: 0,
      totalVotes: 0,
      ...emptyVotes()
    }));

    citiesData[cityName.toLowerCase()] = {
      id: cityName.toLowerCase(),
      name: cityName,
      openBoxRate: 0,
      totalVotes: 0,
      ...emptyVotes(),
      districts,
    };
  }

  return {
    nationalData: {
      openBoxRate: 0,
      totalVotes: 0,
      ...emptyVotes()
    },
    citiesData
  };
};

export function useLiveElectionData() {
  const [data, setData] = useState(generateInitialData());

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prev) => {
        const next = {
          nationalData: {
            ...prev.nationalData,
            candidateVotes: { ...prev.nationalData.candidateVotes },
            partyVotes: { ...prev.nationalData.partyVotes }
          },
          citiesData: { ...prev.citiesData }
        };

        // We randomly update a subset of cities to keep performance good, e.g., 20 random cities
        const citiesToUpdate = Object.keys(next.citiesData)
          .sort(() => 0.5 - Math.random())
          .slice(0, 20);

        citiesToUpdate.forEach(cityId => {
          const city = { ...next.citiesData[cityId] };
          city.candidateVotes = { ...city.candidateVotes };
          city.partyVotes = { ...city.partyVotes };

          city.districts = city.districts.map(d => {
            const district = { ...d };
            district.candidateVotes = { ...district.candidateVotes };
            district.partyVotes = { ...district.partyVotes };

            if (district.openBoxRate < 100) {
              district.openBoxRate = Math.min(100, district.openBoxRate + Math.random() * 2);
            }

            SEED_CANDIDATES.forEach((c, i) => {
              // Create a deterministic bias so different candidates are stronger in different cities AND districts
              const bias = ((i + city.id.length + district.id.length) % SEED_CANDIDATES.length) + 1;
              const add = Math.floor(Math.random() * 20 * bias);
              district.candidateVotes[c.id] += add;
              city.candidateVotes[c.id] += add;
              next.nationalData.candidateVotes[c.id] += add;
              district.totalVotes += add;
              city.totalVotes += add;
              next.nationalData.totalVotes += add;
            });

            SEED_PARTIES.forEach((p, i) => {
              // Create a deterministic bias so different parties are stronger in different cities AND districts
              const bias = ((i + city.id.length + district.id.length) % SEED_PARTIES.length) + 1;
              const add = Math.floor(Math.random() * 20 * bias);
              district.partyVotes[p.id] += add;
              city.partyVotes[p.id] += add;
              next.nationalData.partyVotes[p.id] += add;
            });

            return district;
          });

          // Recalculate city box rate
          city.openBoxRate = city.districts.reduce((sum, d) => sum + d.openBoxRate, 0) / city.districts.length;
          next.citiesData[cityId] = city;
        });

        // Recalculate national box rate
        const allCities = Object.values(next.citiesData);
        next.nationalData.openBoxRate = allCities.reduce((sum, c) => sum + c.openBoxRate, 0) / allCities.length;

        return next;
      });
    }, 2000); // update every 2 seconds

    return () => clearInterval(interval);
  }, []);

  return data;
}
