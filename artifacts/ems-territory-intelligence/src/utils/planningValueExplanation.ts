import type { Agency } from '../types';

export interface PlanningValueExplanation {
  value: number;
  modeledUnits: number | null;
  populationInput: number | null;
  populationBasis: string | null;
  populationPerModeledUnit: number | null;
  dollarsPerModeledUnit: number | null;
  period: string | null;
  status: 'documented_method' | 'method_missing' | 'value_mismatch';
}

export function getPlanningValueExplanation(agency: Agency): PlanningValueExplanation {
  const value = agency.zollOpportunity.projectedPipelineValue;
  const model = agency.planningValueModel;

  if (
    !model ||
    !Number.isFinite(model.populationInput) ||
    !Number.isFinite(model.populationPerModeledUnit) ||
    model.populationPerModeledUnit <= 0 ||
    !Number.isFinite(model.minimumModeledUnits) ||
    !Number.isFinite(model.dollarsPerModeledUnit) ||
    model.dollarsPerModeledUnit < 0
  ) {
    return {
      value,
      modeledUnits: null,
      populationInput: null,
      populationBasis: null,
      populationPerModeledUnit: null,
      dollarsPerModeledUnit: null,
      period: null,
      status: 'method_missing',
    };
  }

  const modeledUnits = Math.max(
    model.minimumModeledUnits,
    Math.round(model.populationInput / model.populationPerModeledUnit),
  );
  const reproducedValue = Math.round(modeledUnits * model.dollarsPerModeledUnit);

  return {
    value,
    modeledUnits,
    populationInput: model.populationInput,
    populationBasis:
      model.populationBasis === 'county_population_proxy'
        ? 'County population proxy; not a verified agency service-area count'
        : 'Generated provider-population proxy; not a provider-reported count',
    populationPerModeledUnit: model.populationPerModeledUnit,
    dollarsPerModeledUnit: model.dollarsPerModeledUnit,
    period: model.period,
    status: reproducedValue === value ? 'documented_method' : 'value_mismatch',
  };
}
