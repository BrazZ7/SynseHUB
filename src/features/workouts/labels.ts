import type {
  BodyRegion,
  EquipmentType,
  ExerciseLevel,
  ExerciseMechanics,
  ExerciseUtility,
  MovementPattern,
  MuscleGroup,
  MuscleTarget,
} from '@/types/domain'

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  CHEST: 'Peito',
  BACK: 'Costas',
  LEGS: 'Pernas',
  SHOULDERS: 'Ombros',
  ARMS: 'Braços',
  CORE: 'Core',
  GLUTES: 'Glúteos',
  CARDIO: 'Cardio',
  FULL_BODY: 'Corpo inteiro',
}

/**
 * Os nomes como se fala na academia, não como está no livro de anatomia.
 *
 * "Latíssimo do dorso" é o nome certo e ninguém usa; quem monta treino diz
 * "dorsal". O termo técnico só aparece onde ele é o termo comum — manguito
 * rotador, por exemplo.
 */
export const MUSCLE_TARGET_LABELS: Record<MuscleTarget, string> = {
  PECTORAL: 'Peitoral',
  SERRATUS: 'Serrátil',
  LATS: 'Dorsal',
  TRAPS: 'Trapézio',
  RHOMBOIDS: 'Romboides',
  LOWER_BACK: 'Lombar',
  DELT_ANTERIOR: 'Ombro anterior',
  DELT_LATERAL: 'Ombro lateral',
  DELT_POSTERIOR: 'Ombro posterior',
  ROTATOR_CUFF: 'Manguito rotador',
  BICEPS: 'Bíceps',
  TRICEPS: 'Tríceps',
  FOREARMS: 'Antebraço',
  ABS: 'Abdômen',
  OBLIQUES: 'Oblíquos',
  HIP_FLEXORS: 'Flexores do quadril',
  QUADS: 'Quadríceps',
  HAMSTRINGS: 'Posterior de coxa',
  GLUTES: 'Glúteos',
  ADDUCTORS: 'Adutores',
  ABDUCTORS: 'Abdutores',
  CALVES: 'Panturrilha',
}

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  UPPER_BODY: 'Superiores',
  LOWER_BODY: 'Inferiores',
  CORE: 'Core',
  FULL_BODY: 'Corpo inteiro',
}

/** A ordem em que as regiões aparecem na tela — de cima para baixo do corpo. */
export const BODY_REGION_ORDER: BodyRegion[] = ['UPPER_BODY', 'LOWER_BODY', 'CORE', 'FULL_BODY']

export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  PUSH_HORIZONTAL: 'Empurrar horizontal',
  PUSH_VERTICAL: 'Empurrar vertical',
  PULL_HORIZONTAL: 'Puxar horizontal',
  PULL_VERTICAL: 'Puxar vertical',
  SQUAT: 'Agachar',
  HINGE: 'Dobradiça de quadril',
  LUNGE: 'Afundo',
  CARRY: 'Carregar',
  ROTATION: 'Rotação',
  GAIT: 'Locomoção',
  CONDITIONING: 'Condicionamento',
  ISOLATION: 'Isolado',
}

export const MECHANICS_LABELS: Record<ExerciseMechanics, string> = {
  COMPOUND: 'Multiarticular',
  ISOLATION: 'Isolado',
}

export const UTILITY_LABELS: Record<ExerciseUtility, string> = {
  BASIC: 'Básico',
  AUXILIARY: 'Auxiliar',
}

export const LEVEL_LABELS: Record<ExerciseLevel, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
}

export const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  BARBELL: 'Barra',
  DUMBBELL: 'Halteres',
  MACHINE: 'Máquina',
  CABLE: 'Polia',
  SMITH: 'Smith',
  BODYWEIGHT: 'Peso corporal',
  KETTLEBELL: 'Kettlebell',
  BAND: 'Elástico',
  PLATE: 'Anilha',
  MEDICINE_BALL: 'Medicine ball',
  CARDIO: 'Cardio',
  OTHER: 'Outro',
}
