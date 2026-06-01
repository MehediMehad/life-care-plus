import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ISpecialty } from "@/types/specialty.type";
import { ChevronsUpDown, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface SpecialtyMultiSelectProps {
  selectedSpecialtyIds: string[];
  removedSpecialtyIds: string[];
  currentSpecialtyId: string;
  availableSpecialties: ISpecialty[];
  isEdit: boolean;
  onCurrentSpecialtyChange: (id: string) => void;
  onAddSpecialty: (id?: string) => void;
  onRemoveSpecialty: (id: string) => void;
  getSpecialty: (id: string) => ISpecialty | undefined;
  getNewSpecialties: () => string[];
}

const SpecialtyMultiSelect = ({
  selectedSpecialtyIds,
  removedSpecialtyIds,
  availableSpecialties,
  isEdit,
  onAddSpecialty,
  onRemoveSpecialty,
  getSpecialty,
  getNewSpecialties,
}: SpecialtyMultiSelectProps) => {
  const [open, setOpen] = useState(false);

  return (
    <Field>
      <FieldLabel htmlFor="specialties">Specialties</FieldLabel>

      {/* Hidden Inputs for Form Submission */}
      <Input
        type="hidden"
        name="specialties"
        value={JSON.stringify(
          isEdit ? getNewSpecialties() : selectedSpecialtyIds,
        )}
      />
      {isEdit && (
        <Input
          type="hidden"
          name="removeSpecialties"
          value={JSON.stringify(removedSpecialtyIds)}
        />
      )}

      {/* Selected Specialties Display */}
      {selectedSpecialtyIds?.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mb-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
          {selectedSpecialtyIds?.map((id) => {
            const specialty = getSpecialty(id);
            return (
              <Badge 
                key={id} 
                variant="secondary" 
                className="px-3 py-1.5 text-sm font-medium flex items-center gap-2 bg-white text-primary border border-primary/20 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all group"
              >
                {specialty?.icon && (
                  <div className="w-5 h-5 flex-shrink-0 relative opacity-80 group-hover:opacity-50 transition-opacity">
                    <Image 
                      src={specialty.icon} 
                      alt={specialty.title || "Specialty icon"} 
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
                {specialty?.title || "Unknown"}
                <Button
                  variant="link"
                  onClick={(e) => {
                    e.preventDefault();
                    onRemoveSpecialty(id);
                  }}
                  className="ml-1 p-0 h-auto text-primary/50 group-hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </Button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Multi-Select Combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-white font-normal hover:bg-gray-50 border-gray-300 h-11"
          >
            <span className="text-gray-500">
              {availableSpecialties?.length === 0 && selectedSpecialtyIds?.length > 0
                ? "All specialties selected"
                : "Select specialties..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search specialties..." className="h-10" />
            <CommandList 
              className="max-h-60 overflow-y-auto"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              <CommandEmpty>No specialties found.</CommandEmpty>
              <CommandGroup>
                {availableSpecialties?.map((specialty) => (
                  <CommandItem
                    key={specialty.id}
                    value={specialty.title}
                    onSelect={() => {
                      onAddSpecialty(specialty.id);
                      // setOpen(false); // keep it open so they can select multiple!
                    }}
                    className="cursor-pointer py-2.5 px-3 mb-1 data-[selected=true]:bg-primary/5 data-[selected=true]:text-primary"
                  >
                    <div className="flex items-center gap-3 w-full">
                      {specialty?.icon ? (
                        <div className="w-6 h-6 relative flex-shrink-0">
                          <Image 
                            src={specialty.icon} 
                            alt={specialty.title} 
                            fill
                            className="object-contain drop-shadow-sm"
                          />
                        </div>
                      ) : (
                        <div className="w-6 h-6 bg-gray-100 rounded-full flex-shrink-0" />
                      )}
                      <span className="font-medium text-gray-700">{specialty?.title}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <p className="text-xs text-gray-500 mt-2">
        {isEdit
          ? "Add new specialties or remove existing ones"
          : "Select one or more specialties for the doctor"}
      </p>

      {/* Edit Mode: Show Changes */}
      {isEdit && (
        <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-100 space-y-2">
          {getNewSpecialties()?.length > 0 && (
            <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
              <span className="text-emerald-500">✓</span> Will add:{" "}
              {getNewSpecialties()?.map(id => getSpecialty(id)?.title)?.join(", ")}
            </p>
          )}
          {removedSpecialtyIds?.length > 0 && (
            <p className="text-xs text-red-600 font-medium flex items-center gap-1.5">
              <span className="text-red-500">✗</span> Will remove:{" "}
              {removedSpecialtyIds?.map(id => getSpecialty(id)?.title)?.join(", ")}
            </p>
          )}
        </div>
      )}
    </Field>
  );
};

export default SpecialtyMultiSelect;
