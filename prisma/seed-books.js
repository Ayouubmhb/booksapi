const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Créer les genres en français
  const genres = {
    developpementPersonnel: await prisma.genre.upsert({
      where: { nom: "Développement personnel" },
      update: {},
      create: { nom: "Développement personnel" },
    }),
    finance: await prisma.genre.upsert({
      where: { nom: "Finance" },
      update: {},
      create: { nom: "Finance" },
    }),
    psychologie: await prisma.genre.upsert({
      where: { nom: "Psychologie" },
      update: {},
      create: { nom: "Psychologie" },
    }),
    philosophie: await prisma.genre.upsert({
      where: { nom: "Philosophie" },
      update: {},
      create: { nom: "Philosophie" },
    }),
    politique: await prisma.genre.upsert({
      where: { nom: "Politique" },
      update: {},
      create: { nom: "Politique" },
    }),
  };

  const books = [
    {
      titre: "Stop Overthinking",
      annee: 2022,
      autheur: "Nick Trenton",
      descr: "Un guide pratique pour réduire le stress, calmer votre esprit et reprendre le contrôle de vos pensées.",
      cover: "covers/bookCover1.jpg",
      genres: [genres.developpementPersonnel, genres.psychologie],
    },
    {
      titre: "The Power of Discipline",
      annee: 2021,
      autheur: "Daniel Walter",
      descr: "Utiliser l'autodiscipline et la rigueur mentale pour atteindre ses objectifs et transformer sa vie.",
      cover: "covers/bookCover2.jpg",
      genres: [genres.developpementPersonnel],
    },
    {
      titre: "L’homme le plus riche de Babylone",
      annee: 1926,
      autheur: "George S. Clason",
      descr: "Des conseils financiers intemporels à travers des paraboles inspirées de la Babylone antique.",
      cover: "covers/bookCover3.jpg",
      genres: [genres.finance],
    },
    {
      titre: "La République Technologique : Pouvoir dur, croyance douce et avenir de l'Occident",
      annee: 2023,
      autheur: "Alexander C. Karp, Nicholas W. Zamiska",
      descr: "Un essai sur la puissance technologique, les valeurs politiques et la résilience démocratique dans le monde moderne.",
      cover: "covers/bookCover4.jpg",
      genres: [genres.philosophie, genres.politique],
    },
  ];

  for (const book of books) {
    const createdBook = await prisma.book.create({
      data: {
        titre: book.titre,
        annee: book.annee,
        autheur: book.autheur,
        descr: book.descr,
        cover: book.cover,
        disponible: true,
      },
    });

    for (const genre of book.genres) {
      await prisma.bookGenre.create({
        data: {
          id_book: createdBook.id,
          id_genre: genre.id,
        },
      });
    }
  }

  console.log("📚 Livres et genres insérés avec succès !");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
